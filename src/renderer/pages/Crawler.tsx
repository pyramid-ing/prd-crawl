import React, { useState, useEffect } from 'react'
import { Button, Card, message, Space, Input, Typography } from 'antd'
import { CloudDownloadOutlined, SaveOutlined } from '@ant-design/icons'
import TerminalLog from './TerminalLog'

const { TextArea } = Input
const { Title } = Typography

const { ipcRenderer } = window.require('electron')

const defaultHtmlTemplate = `<div style="text-align: center;">
  <img src="http://www.domeggook.com/images/item/item_detail_top.gif" style="display: block; margin: 0 auto;">
  <div style="margin-top: 20px;">
    <h2 style="color: #333; font-size: 24px;">\${result.title}</h2>
    <p style="color: #666; font-size: 16px; margin-top: 10px;">\${result.description || ''}</p>
  </div>
  <div style="margin-top: 30px;">
    \${result.detailImagePaths.map(imagePath => \`<img src="\${imagePath}" style="max-width: 100%; margin-bottom: 20px; display: block;">\`).join('\\n')}
  </div>
  <div style="margin-top: 30px; padding: 20px; background-color: #f8f8f8; text-align: left;">
    <h3 style="color: #333; font-size: 18px; margin-bottom: 15px;">제품 정보</h3>
    <ul style="list-style: none; padding: 0;">
      <li style="margin-bottom: 10px;"><strong>모델명:</strong> \${result.modelName || '해당없음'}</li>
      <li style="margin-bottom: 10px;"><strong>제조사:</strong> \${result.manufacturer || '해당없음'}</li>
      <li style="margin-bottom: 10px;"><strong>원산지:</strong> \${result.origin || '해당없음'}</li>
      <li style="margin-bottom: 10px;"><strong>포장규격:</strong> \${result.packageSize || '해당없음'}</li>
    </ul>
  </div>
  <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
    <p style="color: #999; font-size: 14px;">※ 본 상품은 공급사 사정에 따라 갑작스럽게 품절될 수 있습니다.</p>
    <p style="color: #999; font-size: 14px;">※ 상품 상세 정보는 공급사의 정책에 따라 변경될 수 있습니다.</p>
  </div>
</div>`

const Crawler: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [htmlTemplate, setHtmlTemplate] = useState(defaultHtmlTemplate)

  useEffect(() => {
    // 저장된 템플릿 불러오기
    const loadTemplate = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings')
        if (settings?.htmlTemplate) {
          setHtmlTemplate(settings.htmlTemplate)
        }
      } catch (error) {
        console.error('템플릿 불러오기 실패:', error)
      }
    }
    loadTemplate()
  }, [])

  const handleStartCrawling = async () => {
    try {
      setLoading(true)
      // 현재 템플릿 저장
      const settings = await ipcRenderer.invoke('get-settings')
      await ipcRenderer.invoke('save-settings', { ...settings, htmlTemplate })
      await ipcRenderer.invoke('start-crawling')
      message.success('크롤링이 시작되었습니다.')
    } catch (error) {
      console.error('크롤링 시작 실패:', error)
      message.error('크롤링 시작에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      await ipcRenderer.invoke('save-settings', { ...settings, htmlTemplate })
      message.success('템플릿이 저장되었습니다.')
    } catch (error) {
      console.error('템플릿 저장 실패:', error)
      message.error('템플릿 저장에 실패했습니다.')
    }
  }

  const handleResetTemplate = () => {
    setHtmlTemplate(defaultHtmlTemplate)
    message.success('템플릿이 초기화되었습니다.')
  }

  return (
    <Card
      title="도매꾹 크롤링"
      extra={
        <Space>
          <Button onClick={handleResetTemplate}>템플릿 초기화</Button>
          <Button icon={<SaveOutlined />} onClick={handleSaveTemplate}>
            템플릿 저장
          </Button>
          <Button type="primary" icon={<CloudDownloadOutlined />} onClick={handleStartCrawling} loading={loading}>
            크롤링 시작
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 20 }}>
        <Title level={5}>상세설명 HTML 템플릿</Title>
        <TextArea
          value={htmlTemplate}
          onChange={e => setHtmlTemplate(e.target.value)}
          placeholder="HTML 템플릿을 입력하세요"
          autoSize={{ minRows: 10, maxRows: 20 }}
        />
        <div style={{ marginTop: 8, color: '#666' }}>
          사용 가능한 변수: {'{result.title}'}, {'{result.description}'}, {'{result.modelName}'},{' '}
          {'{result.manufacturer}'}, {'{result.origin}'}, {'{result.packageSize}'}, {'{result.detailImagePaths}'}
        </div>
      </div>
      <TerminalLog />
    </Card>
  )
}

export default Crawler
