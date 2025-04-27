import React, { useEffect, useState } from 'react'
import { Card } from 'antd'

const { ipcRenderer } = window.require('electron')

interface LogMessage {
  log: string
  level: 'info' | 'warning' | 'error'
}

const TerminalLog: React.FC = () => {
  const [logs, setLogs] = useState<LogMessage[]>([])

  useEffect(() => {
    const handleLogMessage = (_: any, message: LogMessage) => {
      setLogs(prev => [...prev, message])
    }

    ipcRenderer.on('log-message', handleLogMessage)

    return () => {
      ipcRenderer.removeListener('log-message', handleLogMessage)
    }
  }, [])

  const getLogStyle = (level: string) => {
    switch (level) {
      case 'error':
        return { color: '#ff4d4f' }
      case 'warning':
        return { color: '#faad14' }
      default:
        return { color: '#1890ff' }
    }
  }

  return (
    <Card
      title="로그"
        style={{
        height: '400px',
        overflow: 'auto',
          backgroundColor: '#000',
          color: '#fff',
        }}
      >
      <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        {logs.map((log, index) => (
          <div key={index} style={getLogStyle(log.level)}>
            {log.log}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default TerminalLog
