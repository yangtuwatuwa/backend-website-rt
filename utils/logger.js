// utils/logger.js
// Centralized request/response logger for audit purposes.
// Logs method, URL, query params, body payload, and final status code.

import fs from 'fs'
import path from 'path'

// Ensure logs directory exists
const logsDir = path.resolve(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir)
}

export function requestLogger(req, res, next) {
  const startTime = new Date()
  const requestId = `${startTime.getTime()}-${Math.random().toString(36).substr(2,5)}`
  const logEntry = {
    id: requestId,
    timestamp: startTime.toISOString(),
    method: req.method,
    url: req.originalUrl,
    query: req.query,
    body: req.body,
    user: req.user ? { id: req.user.id, role: req.user.role } : null,
  }

  // When response finishes, capture status & duration
  res.on('finish', () => {
    const endTime = new Date()
    const duration = endTime - startTime
    logEntry.status = res.statusCode
    logEntry.durationMs = duration
    const logLine = JSON.stringify(logEntry) + '\n'
    // Append to audit log file (rotating daily)
    const logFile = path.join(logsDir, `audit-${startTime.toISOString().slice(0,10)}.log`)
    fs.appendFileSync(logFile, logLine)
    // Also output to console in a tidy format for dev
    console.log(`[AUDIT] ${logEntry.timestamp} ${logEntry.method} ${logEntry.url} → ${logEntry.status} (${duration}ms)`) 
    if (Object.keys(logEntry.body || {}).length) {
      console.log(`[AUDIT]   Body: ${JSON.stringify(logEntry.body)}`)
    }
    if (Object.keys(logEntry.query || {}).length) {
      console.log(`[AUDIT]   Query: ${JSON.stringify(logEntry.query)}`)
    }
  })

  next()
}
