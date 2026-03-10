// ============================================
// SENTINEL — Winston Logger
// ============================================
// Structured logging with timestamps. Console for dev, file for production.

const { createLogger, format, transports } = require('winston');
const config = require('./index');

const logger = createLogger({
  level: config.server.logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'sentinel' },
  transports: [
    // Console transport — colorized in development
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, service, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} [${service}] ${level}: ${message}${extra}`;
        })
      )
    })
  ]
});

// In production, also log to file
if (config.server.env === 'production') {
  logger.add(new transports.File({
    filename: 'sentinel-error.log',
    level: 'error'
  }));
  logger.add(new transports.File({
    filename: 'sentinel.log'
  }));
}

module.exports = logger;
