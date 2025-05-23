import * as puppeteer from 'puppeteer-core'
import * as XLSX from 'xlsx'
import Store from 'electron-store'
import path from 'path'
import * as fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'
import { StoreSchema } from './main'
import dayjs from 'dayjs'

interface CrawlResult {
  title: string
  price: number
  description: string
  category: string
  condition: string
  shipping: {
    method: string
    period: string
    base: string
    details: string
    jeju: string
    island: string
    bundle?: string
  }
  url: string
  origin: string
  modelName: string
  manufacturer: string
  packageSize: string
  certification: string
  detailImages: string[]
  detailContent: string
  screenshotPath: string
  thumbnailUrl: string
  imageUsageAllowed: string
  thumbnailPath: string
  detailImagePaths: string[]
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }

  // 이미지 다운로드 함수
  private async downloadImage(url: string, savePath: string): Promise<void> {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
      })

      const writer = fs.createWriteStream(savePath)
      response.data.pipe(writer)

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', err => {
          fs.unlink(savePath, () => reject(err))
        })
      })
    } catch (error) {
      throw new Error(`이미지 다운로드 실패: ${error.message}`)
    }
  }

  // URL에서 파일명 생성
  private getFileNameFromUrl(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex')
    const ext = path.extname(url) || '.jpg'
    return `${hash}${ext}`
  }

  async crawlProduct(url: string, resultDir: string): Promise<CrawlResult> {
    if (!this.browser) {
      throw new Error('브라우저가 초기화되지 않았습니다.')
    }

    const page = await this.browser.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle0' })

      // 상품명을 파일명으로 사용하기 위해 먼저 추출
      const title = await page.$eval('#lInfoItemTitle', el => el.textContent?.trim() || '')
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_')

      // 이미지 저장 디렉토리 설정
      const imagesDir = path.join(resultDir, 'images')
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true })
      }

      // 스크린샷 저장
      const screenshotPath = path.join(imagesDir, `${safeTitle}_detail.jpg`)
      const element = await page.$('#lInfoViewItemContents')
      if (element) {
        await element.screenshot({
          path: screenshotPath,
          type: 'jpeg',
          quality: 80,
        })
      }

      const result = await page.evaluate(() => {
        // 상품명
        const title = document.querySelector('#lInfoItemTitle')?.textContent?.trim() || ''

        // 가격 (숫자만 추출)
        const priceText = document.querySelector('.lGGookDealAmt b')?.textContent?.trim() || '0'
        const price = parseInt(priceText.replace(/[^0-9]/g, ''))

        // 썸네일 이미지 URL 추출
        const thumbnailImg = document.querySelector('#lThumbImg') as HTMLImageElement
        const thumbnailUrl = thumbnailImg?.src || ''

        // 상품 설명
        const description = document.querySelector('#lInfoBody')?.textContent?.trim() || ''

        // 카테고리 경로 추출
        const categoryPath = Array.from(document.querySelectorAll('#lPath ol.main > li'))
          .map(li => {
            const link = li.querySelector('a')
            return link ? link.textContent?.trim() : li.textContent?.trim()
          })
          .filter(text => text && text !== '도매꾹홈')
          .join(' > ')

        // 상품 상태 (재고수량으로 대체)
        const condition = document.querySelector('.lInfoQty .lInfoItemContent')?.textContent?.trim() || ''

        // 배송 정보 간단 크롤링
        const method = document.querySelector('#lLayerDeli .lTbl tr:nth-child(1) td')?.textContent?.trim() || ''
        const period = document.querySelector('#lLayerDeli .lTbl tr:nth-child(2) td')?.textContent?.trim() || ''
        const base = document.querySelector('#lLayerDeli .lTbl tr:nth-child(3) td')?.textContent?.trim() || ''
        const bundle = document.querySelector('#lLayerDeli .lTbl tr.lLast td')?.textContent?.trim() || ''

        // 제주/도서산간 추가배송비 추출
        const addDiv = document.querySelector('#lLayerDeli .lTbl tr:nth-child(3) td .lInfoDeliAdd')
        let jeju = '',
          island = ''
        if (addDiv) {
          const html = addDiv.innerHTML
          const jejuMatch = html.match(/제주지역\s*\+<b[^>]*>([\d,]+)<\/b>원/)
          const islandMatch = html.match(/도서산간\s*\+<b[^>]*>([\d,]+)<\/b>원/)
          jeju = jejuMatch ? jejuMatch[1].replace(/,/g, '') : ''
          island = islandMatch ? islandMatch[1].replace(/,/g, '') : ''
        }

        const shippingInfo = {
          method,
          period,
          base,
          details: '',
          jeju,
          island,
          bundle,
        }

        // 상품 상세 정보
        const origin =
          document
            .querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(1) .lTblHalf:first-child .lTblCell:last-child')
            ?.textContent?.trim() || ''
        const modelName =
          document
            .querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(1) .lTblHalf:last-child .lTblCell:last-child')
            ?.textContent?.trim() || ''
        const manufacturer =
          document
            .querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(2) .lTblHalf:first-child .lTblCell:last-child')
            ?.textContent?.trim() || ''
        const packageSize =
          document
            .querySelector('#lInfoViewItemInfoWrap .lTblRow:nth-child(2) .lTblHalf:last-child .lTblCell:last-child')
            ?.textContent?.trim() || ''
        const certification = document.querySelector('#lSafetyCert .lExemContent')?.textContent?.trim() || ''

        // 상세 설명 이미지와 내용
        const detailImages = Array.from(document.querySelectorAll('#lInfoViewItemContents img')).map(
          img => (img as HTMLImageElement).src,
        )
        const detailContent = document.querySelector('#lInfoViewItemContents')?.innerHTML?.trim() || ''

        // 상세설명 이미지 사용 허용 여부
        const imageUsageAllowed =
          document.querySelector('.lInfoViewImgUse div:first-child b')?.textContent?.trim() || ''

        return {
          title,
          price,
          description,
          thumbnailUrl,
          category: categoryPath,
          condition,
          shipping: shippingInfo,
          origin,
          modelName,
          manufacturer,
          packageSize,
          certification,
          detailImages,
          detailContent,
          imageUsageAllowed,
        }
      })

      // 썸네일 다운로드
      let thumbnailPath = ''
      try {
        const thumbnailFileName = this.getFileNameFromUrl(result.thumbnailUrl)
        thumbnailPath = path.join(imagesDir, thumbnailFileName)
        await this.downloadImage(result.thumbnailUrl, thumbnailPath)
      } catch (e) {
        console.error(`썸네일 이미지 다운로드 실패: ${result.thumbnailUrl}`, e)
        thumbnailPath = ''
      }

      // 상세 이미지 다운로드
      const detailImagePaths: string[] = []
      for (const imageUrl of result.detailImages) {
        try {
          const fileName = this.getFileNameFromUrl(imageUrl)
          const imagePath = path.join(imagesDir, fileName)
          await this.downloadImage(imageUrl, imagePath)
          detailImagePaths.push(imagePath)
        } catch (e) {
          console.error(`상세 이미지 다운로드 실패: ${imageUrl}`, e)
          // 실패한 이미지는 경로 추가하지 않음
        }
      }

      return {
        ...result,
        url,
        screenshotPath,
        thumbnailPath,
        detailImagePaths,
      }
    } finally {
      await page.close()
    }
  }

  // detailContent가 32767자를 초과할 경우 파일로 저장하는 함수 추가
  private saveLongTextToFile(content: string, dir: string, title: string): string {
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_')
    const filePath = path.join(dir, `${safeTitle}_detail.txt`)
    fs.writeFileSync(filePath, content, { encoding: 'utf-8' })
    return filePath
  }

  async crawlFromExcel(): Promise<void> {
    const excelPath = this.store.get('settings.crawlExcelPath') as string
    if (!excelPath) {
      throw new Error('크롤링용 Excel 파일 경로가 설정되지 않았습니다.')
    }

    const saveFolderPath = this.store.get('settings.saveFolderPath') as string
    if (!saveFolderPath) {
      throw new Error('결과 저장 폴더 경로가 설정되지 않았습니다.')
    }

    const workbook = XLSX.readFile(excelPath)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(worksheet)

    // 결과 폴더 생성 (설정된 폴더 내에 생성)
    const timestamp = dayjs().format('YYYYMMDD_HHmmss')
    const resultDir = path.join(saveFolderPath, `크롤링결과_${timestamp}`)
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true })
    }

    // 마지막 결과 폴더 경로 저장
    this.store.set('settings.lastResultPath', resultDir)

    const results: CrawlResult[] = []
    for (const row of data) {
      const url = (row as any).url
      if (url) {
        try {
          const result = await this.crawlProduct(url, resultDir)
          results.push(result)
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          console.error(`URL 크롤링 실패: ${url}`, error)
        }
      }
    }

    // 1. 원본 데이터 엑셀 저장 (origin.xlsx)
    const originWorkbook = XLSX.utils.book_new()
    const originWorksheet = XLSX.utils.json_to_sheet(
      results.map(result => {
        let detailContentValue: string
        if (result.detailContent.length > 32767) {
          detailContentValue = this.saveLongTextToFile(result.detailContent, resultDir, result.title)
        } else {
          detailContentValue = result.detailContent
        }
        return {
          상품명: result.title,
          가격: result.price,
          썸네일: result.thumbnailPath,
          카테고리: result.category,
          상태: result.condition,
          배송방법: result.shipping.method,
          발송기간: result.shipping.period,
          기본배송비: result.shipping.base,
          제주추가배송비: result.shipping.jeju,
          도서산간추가배송비: result.shipping.island,
          묶음배송: result.shipping.bundle,
          원산지: result.origin,
          모델명: result.modelName,
          제조사: result.manufacturer,
          '포장부피/무게': result.packageSize,
          인증정보: result.certification,
          상세이미지: result.detailImagePaths.join('\n'),
          상세설명: detailContentValue,
          이미지사용허용: result.imageUsageAllowed,
          스크린샷경로: result.screenshotPath,
          원본URL: result.url,
        }
      }),
    )
    XLSX.utils.book_append_sheet(originWorkbook, originWorksheet, '원본데이터')
    XLSX.writeFile(originWorkbook, path.join(resultDir, 'origin.xlsx'))

    // 2. S2B 업로드용 엑셀 저장 (s2b.xlsx)
    const s2bWorkbook = XLSX.utils.book_new()
    const s2bWorksheet = XLSX.utils.json_to_sheet(
      results.map(result => {
        // 원산지 파싱 로직
        const domesticRegions = [
          '강원',
          '경기',
          '경남',
          '경북',
          '광주',
          '대구',
          '대전',
          '부산',
          '서울',
          '세종',
          '울산',
          '인천',
          '전남',
          '전북',
          '제주',
          '충남',
          '충북',
        ]

        const foreignCountries = [
          '과테말라',
          '그리스',
          '나이지리아',
          '남아프리카공화국',
          '네덜란드',
          '노르웨이',
          '뉴질랜드',
          '대만',
          '덴마크',
          '독일',
          '동티모르',
          '라오스',
          '라트비아',
          '러시아',
          '루마니아',
          '리투아니아',
          '말레이시아',
          '멕시코',
          '모로코',
          '모리셔스',
          '미국',
          '미얀마',
          '방글라데시',
          '베트남',
          '벨기에',
          '벨라루스',
          '보스니아',
          '북한',
          '불가리아',
          '브라질',
          '스리랑카',
          '스웨덴',
          '스위스',
          '스페인',
          '슬로바키아',
          '슬로베니아',
          '싱가폴',
          '아르헨티나',
          '아일랜드',
          '에스토니아',
          '영국',
          '오스트레일리아',
          '오스트리아',
          '온두라스',
          '요르단',
          '우크라이나',
          '이스라엘',
          '이집트',
          '이탈리아',
          '인도',
          '인도네시아',
          '일본',
          '중국',
          '중국OEM',
          '체코',
          '칠레',
          '캄보디아',
          '캐나다',
          '콜롬비아',
          '크로아티아',
          '키르기스스탄',
          '키프로스',
          '태국',
          '터키',
          '튀니지',
          '파키스탄',
          '포르투갈',
          '폴란드',
          '프랑스',
          '핀란드',
          '필리핀',
          '헝가리',
          '홍콩',
        ]

        let originType = ''
        let originDomestic = ''
        let originForeign = ''

        if (result.origin) {
          const originParts = result.origin.split('_')

          // "국산"인 경우
          if (result.origin === '국산') {
            originType = '국내'
            originDomestic = '경기'
            originForeign = ''
          }
          // "수입산"이 포함된 경우
          else if (result.origin.includes('수입산')) {
            originType = '국외'
            originDomestic = ''
            // 언더스코어로 나눈 마지막 부분을 해외원산지로 설정
            originForeign = originParts.length > 1 ? originParts[originParts.length - 1] : result.origin
          }
          // 해외 국가가 포함된 경우
          else if (foreignCountries.some(country => result.origin.includes(country))) {
            originType = '국외'
            originDomestic = ''
            originForeign = result.origin
          }
          // 국내 지역이 포함된 경우
          else if (domesticRegions.some(region => result.origin.includes(region)) || result.origin.includes('국내')) {
            originType = '국내'
            originDomestic = result.origin
            originForeign = ''
          }
          // 마지막 부분이 국가명인 경우 (예: 수입산_아시아_중국)
          else if (originParts.length > 1) {
            const lastPart = originParts[originParts.length - 1]
            if (foreignCountries.includes(lastPart)) {
              originType = '국외'
              originDomestic = ''
              originForeign = lastPart
            } else {
              // 기본값으로 국외 처리
              originType = '국외'
              originDomestic = ''
              originForeign = result.origin
            }
          }
          // 그 외의 경우 기본값으로 국외 처리
          else {
            originType = '국외'
            originDomestic = ''
            originForeign = result.origin
          }
        }

        let detailContentValue: string
        if (result.detailContent.length > 32767) {
          detailContentValue = this.saveLongTextToFile(result.detailContent, resultDir, result.title)
        } else {
          detailContentValue = result.detailContent
        }

        return {
          카테고리1: '',
          카테고리2: '',
          카테고리3: '',
          등록구분: '물품',
          물품명: result.title,
          규격: '',
          모델명: result.modelName ?? '해당없음',
          제시금액: result.price,
          제조사: result.manufacturer,
          '소재/재질': '',
          재고수량: 9999,
          판매단위: '개',
          보증기간: '1년',
          납품가능기간: '7일',
          '견적서 유효기간': '',
          배송비종류: '무료', // 배송비 무료
          배송비: '', // 빈 값
          반품배송비: 3500,
          묶음배송여부: 'Y',
          제주배송여부: 'Y',
          제주추가배송비: 5000,
          상세설명HTML: eval('`' + (this.store.get('settings.htmlTemplate')) + '`'),
          기본이미지1: result.thumbnailPath, // 썸네일 로컬 경로
          기본이미지2: '',
          추가이미지1: '',
          추가이미지2: '',
          상세이미지: result.screenshotPath, // 상세 이미지 로컬 경로
          원산지구분: originType,
          국내원산지: originDomestic,
          해외원산지: originForeign,
        }
      }),
    )
    XLSX.utils.book_append_sheet(s2bWorkbook, s2bWorksheet, 'S2B업로드')
    XLSX.writeFile(s2bWorkbook, path.join(resultDir, 's2b.xlsx'))
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
