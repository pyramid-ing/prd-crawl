import React, { useState } from 'react'
import { Button, Card, message, Space } from 'antd'
import { CloudDownloadOutlined } from '@ant-design/icons'
import TerminalLog from './TerminalLog'

const { ipcRenderer } = window.require('electron')

const Crawler: React.FC = () => {
  const [loading, setLoading] = useState(false)

  const handleStartCrawling = async () => {
    try {
      setLoading(true)
      await ipcRenderer.invoke('start-crawling')
      message.success('크롤링이 시작되었습니다.')
    } catch (error) {
      console.error('크롤링 시작 실패:', error)
      message.error('크롤링 시작에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      title="도매꾹 크롤링"
      extra={
        <Space>
          <Button type="primary" icon={<CloudDownloadOutlined />} onClick={handleStartCrawling} loading={loading}>
            크롤링 시작
          </Button>
        </Space>
      }
    >
      <div>
        테스트입니다2
      </div>
      <TerminalLog />
    </Card>
  )
}

export default Crawler
