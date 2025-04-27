import React, { useEffect, useState } from 'react'
import { Button, Card, Form, Input, message, Switch } from 'antd'
import { FolderOutlined } from '@ant-design/icons'

const { ipcRenderer } = window.require('electron')

interface SettingsForm {
  crawlExcelPath: string // 크롤링용 엑셀 파일 경로
  headless: boolean // 헤드리스 모드 여부
  saveFolderPath: string // 저장 폴더 경로
}

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    loadSettings().finally(() => setInitialLoading(false))
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (settings) {
        form.setFieldsValue(settings)
        console.log('Settings loaded successfully:', settings)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      message.error({
        content: '설정을 불러오는데 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    }
  }

  const handleSelectCrawlExcel = async () => {
    try {
      let path = await ipcRenderer.invoke('select-excel')
      if (path) {
        path = decodeURIComponent(encodeURIComponent(path)) // 한글 인코딩 문제 해결
        form.setFieldValue('crawlExcelPath', path)
        console.log('Selected Crawl Excel file:', path)
      }
    } catch (error) {
      console.error('Failed to select Crawl Excel file:', error)
      message.error('크롤링용 Excel 파일 선택에 실패했습니다.')
    }
  }

  const handleSelectSaveFolder = async () => {
    try {
      let path = await ipcRenderer.invoke('select-directory')
      if (path) {
        path = decodeURIComponent(encodeURIComponent(path)) // 한글 인코딩 문제 해결
        form.setFieldValue('saveFolderPath', path)
        console.log('Selected Save Folder:', path)
      }
    } catch (error) {
      console.error('Failed to select Save Folder:', error)
      message.error('저장 폴더 선택에 실패했습니다.')
    }
  }

  const handleSubmit = async (values: SettingsForm) => {
    try {
      setLoading(true)
      await ipcRenderer.invoke('save-settings', values)
      message.success({
        content: '설정이 저장되었습니다.',
        key: 'settings-success',
        duration: 2,
      })
      console.log('Settings saved successfully:', values)
    } catch (error) {
      console.error('Failed to save settings:', error)
      message.error({
        content: '설정 저장에 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return <Card loading={true} />
  }

  return (
    <Card title="크롤링 설정">
      <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off" disabled={loading}>
        <Form.Item
          label="크롤링용 Excel 파일 경로"
          name="crawlExcelPath"
          rules={[{ required: true, message: '크롤링용 Excel 파일을 선택해주세요' }]}
        >
          <Input
            readOnly
            addonAfter={
              <Button type="text" icon={<FolderOutlined />} onClick={handleSelectCrawlExcel} disabled={loading}>
                선택
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          label="저장 폴더 경로"
          name="saveFolderPath"
          rules={[{ required: true, message: '저장 폴더를 선택해주세요' }]}
        >
          <Input
            readOnly
            addonAfter={
              <Button type="text" icon={<FolderOutlined />} onClick={handleSelectSaveFolder} disabled={loading}>
                선택
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          label="브라우저 숨김"
          name="headless"
          valuePropName="checked"
          initialValue={false}
          tooltip="브라우저 숨김 여부를 선택합니다."
        >
          <Switch />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default Settings
