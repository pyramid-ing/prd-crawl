import * as puppeteer from 'puppeteer-core'
import * as XLSX from 'xlsx'
import Store from 'electron-store'
import path from 'path'
import * as fs from 'fs'

interface CrawlResult {
  title: string
  price: number
  description: string
  images: string[]
  category: string
  condition: string
  shipping: string
  url: string
  origin: string
  modelName: string
  manufacturer: string
  packageSize: string
  certification: string
  detailImages: string[]
  detailContent: string
  screenshotPath: string
}

// Store 타입 정의
interface StoreSchema {
  settings: {
    crawlExcelPath: string
    headless: boolean
  }
}

export class DomeggookCrawler {
  private browser: puppeteer.Browser | null = null
  private store: Store<StoreSchema>
  private chromePath: string

  constructor(store: Store<StoreSchema>) {
    this.store = store
    this.chromePath = this.getChromePath()
  }

  private getChromePath(): string {
    // OS별 Chrome 기본 설치 경로 설정
    if (process.platform === 'darwin') {
      // macOS
      const possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          return path
        }
      }
    } else if (process.platform === 'win32') {
      // Windows
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      ]
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          return path
        }
      }
    } else {
      // Linux
      const possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ]
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          return path
        }
      }
    }

    throw new Error('Chrome 브라우저를 찾을 수 없습니다. Chrome이 설치되어 있는지 확인해주세요.')
  }

  async initialize() {
    const headless = this.store.get('settings.headless') as boolean
    this.browser = await puppeteer.launch({
      headless: !!headless,
      executablePath: this.chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
  }

  async crawlProduct(url: string): Promise<CrawlResult> {
    if (!this.browser) {
      throw new Error('브라우저가 초기화되지 않았습니다.')
    }

    const page = await this.browser.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle0' })
      
      // 상품명을 파일명으로 사용하기 위해 먼저 추출
      const title = await page.$eval('#lInfoItemTitle', el => el.textContent?.trim() || '')
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_') // 파일명에 사용할 수 없는 문자 제거
      
      // 스크린샷 저장 경로 설정
      const screenshotDir = path.join(process.cwd(), 'screenshots')
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true })
      }
      const screenshotPath = path.join(screenshotDir, `${safeTitle}.png`)

      // 상세 설명 부분만 캡쳐
      const element = await page.$('#lInfoViewItemContents')
      if (element) {
        await element.screenshot({
          path: screenshotPath,
          type: 'png'
        })
      }

      const result = await page.evaluate(() => {
        // 상품명
        const title = document.querySelector('#lInfoItemTitle')?.textContent?.trim() || ''
        
        // 가격 (숫자만 추출)
        const priceText = document.querySelector('.lGGookDealAmt b')?.textContent?.trim() || '0'
        const price = parseInt(priceText.replace(/[^0-9]/g, ''))
        
        // 상품 설명
        const description = document.querySelector('#lInfoBody')?.textContent?.trim() || ''
        
        // 이미지 URL들
        const images = Array.from(document.querySelectorAll('#lInfoBody img')).map(img => (img as HTMLImageElement).src)
        
        // 카테고리 (원산지 정보로 대체)
        const category = document.querySelector('.lInfoItemCountryContent')?.textContent?.trim() || ''
        
        // 상품 상태 (재고수량으로 대체)
        const condition = document.querySelector('.lInfoQty .lInfoItemContent')?.textContent?.trim() || ''
        
        // 배송 정보
        const shipping = document.querySelector('.lDeliMethod')?.textContent?.trim() || ''

        // 상품 상세 정보
        const origin = document.querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(1) .lTblHalf:first-child .lTblCell:last-child')?.textContent?.trim() || ''
        const modelName = document.querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(1) .lTblHalf:last-child .lTblCell:last-child')?.textContent?.trim() || ''
        const manufacturer = document.querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(2) .lTblHalf:first-child .lTblCell:last-child')?.textContent?.trim() || ''
        const packageSize = document.querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(2) .lTblHalf:last-child .lTblCell:last-child')?.textContent?.trim() || ''
        const certification = document.querySelector('#lSafetyCert .lExemContent')?.textContent?.trim() || ''

        // 상세 설명 이미지와 내용
        const detailImages = Array.from(document.querySelectorAll('#lInfoViewItemContents img')).map(img => (img as HTMLImageElement).src)
        const detailContent = document.querySelector('#lInfoViewItemContents')?.innerHTML?.trim() || ''

        return {
          title,
          price,
          description,
          images,
          category,
          condition,
          shipping,
          origin,
          modelName,
          manufacturer,
          packageSize,
          certification,
          detailImages,
          detailContent
        }
      })

      return {
        ...result,
        url,
        screenshotPath
      }
    } finally {
      await page.close()
    }
  }

  async crawlFromExcel(): Promise<void> {
    const excelPath = this.store.get('settings.crawlExcelPath') as string
    if (!excelPath) {
      throw new Error('크롤링용 Excel 파일 경로가 설정되지 않았습니다.')
    }

    const workbook = XLSX.readFile(excelPath)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(worksheet)

    const results: CrawlResult[] = []
    for (const row of data) {
      const url = (row as any).url
      if (url) {
        try {
          const result = await this.crawlProduct(url)
          results.push(result)
          // 크롤링 딜레이 적용
          await new Promise(resolve => setTimeout(resolve, 1000)) // 1초 딜레이
        } catch (error) {
          console.error(`URL 크롤링 실패: ${url}`, error)
        }
      }
    }

    // 결과를 Excel로 저장
    const outputWorkbook = XLSX.utils.book_new()
    const outputWorksheet = XLSX.utils.json_to_sheet(results.map(result => ({
      '상품명': result.title,
      '가격': result.price,
      '설명': result.description,
      '이미지': result.images.join('\n'),
      '카테고리': result.category,
      '상태': result.condition,
      '배송': result.shipping,
      '원산지': result.origin,
      '모델명': result.modelName,
      '제조사': result.manufacturer,
      '포장부피/무게': result.packageSize,
      '인증정보': result.certification,
      '상세이미지': result.detailImages.join('\n'),
      '상세설명': result.detailContent,
      '스크린샷경로': result.screenshotPath,
      '원본URL': result.url
    })))

    XLSX.utils.book_append_sheet(outputWorkbook, outputWorksheet, '크롤링결과')

    // 결과 폴더 생성
    const resultDir = path.join(path.dirname(excelPath), `크롤링결과_${new Date().toISOString().split('T')[0]}`)
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true })
    }

    // Excel 파일 저장
    const outputPath = path.join(resultDir, '크롤링결과.xlsx')
    XLSX.writeFile(outputWorkbook, outputPath)

    // 스크린샷 폴더를 결과 폴더로 이동
    const screenshotsDir = path.join(process.cwd(), 'screenshots')
    const targetScreenshotsDir = path.join(resultDir, 'screenshots')
    if (fs.existsSync(screenshotsDir)) {
      if (fs.existsSync(targetScreenshotsDir)) {
        fs.rmSync(targetScreenshotsDir, { recursive: true, force: true })
      }
      fs.renameSync(screenshotsDir, targetScreenshotsDir)
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
