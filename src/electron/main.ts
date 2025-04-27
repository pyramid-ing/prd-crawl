import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { DomeggookCrawler } from './crawler'
import dayjs from 'dayjs'

interface StoreSchema {
  settings: {
    crawlExcelPath: string
    headless: boolean
  }
}

// Store 인스턴스 생성
const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      crawlExcelPath: '',
      headless: false,
    },
  },
  encryptionKey: 's2b-uploader-secret-key',
})

let mainWindow: BrowserWindow | null = null

function sendLogToRenderer(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss')
  if (mainWindow) {
    mainWindow.webContents.send('log-message', { log: `[${timestamp}] ${message}`, level })
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../../build/icon.png'),
  })

  if (process.env.ELECTRON_DEBUG) {
    console.log('Loading dev server at http://localhost:8080')
    mainWindow.loadURL('http://localhost:8080')
  } else {
    const indexPath = path.resolve(app.getAppPath(), 'dist/renderer/index.html')
    mainWindow.loadFile(indexPath)
  }
}

// IPC 핸들러 설정
function setupIpcHandlers() {
  let crawler: DomeggookCrawler | null = null

  // 앱 버전 가져오기
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // 설정 가져오기
  ipcMain.handle('get-settings', () => {
    return store.get('settings')
  })

  // 설정 저장
  ipcMain.handle('save-settings', async (_, settings) => {
    store.set('settings', settings)
  })

  // Excel 파일 선택
  ipcMain.handle('select-excel', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
    })
    return result.filePaths[0]
  })

  // 크롤링 시작
  ipcMain.handle('start-crawling', async () => {
    try {
      const settings = store.get('settings')
      if (!settings.crawlExcelPath) {
        throw new Error('크롤링용 Excel 파일 경로가 설정되지 않았습니다.')
      }

      crawler = new DomeggookCrawler(store)
      await crawler.initialize()
      await crawler.crawlFromExcel()
      await crawler.close()

      sendLogToRenderer('크롤링이 완료되었습니다.', 'info')
    } catch (error) {
      console.error('크롤링 실패:', error)
      sendLogToRenderer(`크롤링 실패: ${error.message}`, 'error')
      if (crawler) {
        await crawler.close()
      }
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
