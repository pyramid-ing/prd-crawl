import React, { useState, useEffect } from 'react'
import { Button, Card, message, Space, Input, Typography, InputNumber, Row, Col } from 'antd'
import { CloudDownloadOutlined, SaveOutlined } from '@ant-design/icons'
import TerminalLog from './TerminalLog'

const { TextArea } = Input
const { Title } = Typography

const { ipcRenderer } = window.require('electron')

const Crawler: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [htmlTemplate, setHtmlTemplate] = useState('')
  const [profitPercent, setProfitPercent] = useState(30) // 기본값 30%

  useEffect(() => {
    // 저장된 설정 불러오기
    const loadSettings = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings')
        if (settings?.htmlTemplate) {
          setHtmlTemplate(settings.htmlTemplate)
        }
        if (settings?.profitPercent !== undefined) {
          setProfitPercent(settings.profitPercent)
        }
      } catch (error) {
        console.error('설정 불러오기 실패:', error)
      }
    }
    loadSettings()
  }, [])

  const handleStartCrawling = async () => {
    try {
      setLoading(true)
      // 현재 설정 저장
      const settings = await ipcRenderer.invoke('get-settings') || {}
      await ipcRenderer.invoke('save-settings', { 
        ...settings, 
        htmlTemplate: htmlTemplate || settings.htmlTemplate,
        profitPercent: profitPercent || settings.profitPercent,
      })
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
      const settings = await ipcRenderer.invoke('get-settings') || {}
      await ipcRenderer.invoke('save-settings', { 
        ...settings, 
        htmlTemplate: htmlTemplate || settings.htmlTemplate,
        profitPercent: profitPercent || settings.profitPercent,
      })
      message.success('설정이 저장되었습니다.')
    } catch (error) {
      console.error('설정 저장 실패:', error)
      message.error('설정 저장에 실패했습니다.')
    }
  }

  const handleResetTemplate = () => {
    setHtmlTemplate('')
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
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Title level={5}>순익 설정</Title>
          <Space align="center">
            <InputNumber
              min={0}
              max={100}
              value={profitPercent}
              onChange={value => setProfitPercent(value)}
              formatter={value => `${value}%`}
              parser={value => Number(value!.replace('%', ''))}
              style={{ width: 120 }}
            />
            <span style={{ color: '#666' }}>설정한 순익률만큼 가격이 자동으로 계산됩니다. (예: 30% = 원가 × 1.3)</span>
          </Space>
        </Col>
        <Col span={24}>
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
        </Col>
      </Row>
      <TerminalLog />
    </Card>
  )
}

export default Crawler
