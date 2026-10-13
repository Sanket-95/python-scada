import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const USER_CFG_PATH    = path.resolve(import.meta.dirname, 'src/config/savedUserConfig.json')
const HEADER_CFG_PATH  = path.resolve(import.meta.dirname, 'src/config/savedHeaderConfig.json')
const PAGE_SEL_CFG_PATH = path.resolve(import.meta.dirname, 'src/config/savedPageSelection.json')
const PLC_CFG_PATH     = path.resolve(import.meta.dirname, 'src/config/savedPlcConfig.json')

// Simple GET/POST-to-a-JSON-file API — no database, just a config file on disk.
function jsonFileApi(name, route, filePath) {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')
        if (req.method === 'GET') {
          try {
            res.end(fs.readFileSync(filePath, 'utf-8'))
          } catch {
            res.end('null')
          }
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              fs.writeFileSync(filePath, JSON.stringify(JSON.parse(body), null, 2), 'utf-8')
              res.end('{"ok":true}')
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        } else {
          res.statusCode = 405
          res.end('{"error":"Method not allowed"}')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    jsonFileApi('scada-config-api', '/api/scada-config', USER_CFG_PATH),
    jsonFileApi('header-config-api', '/api/header-config', HEADER_CFG_PATH),
    jsonFileApi('page-selection-api', '/api/page-selection', PAGE_SEL_CFG_PATH),
    jsonFileApi('plc-config-api', '/api/plc-config', PLC_CFG_PATH),
  ],
  server: {
    proxy: {
      // Everything else under /api (right now: App Builder's exe-generation
      // endpoints) needs the actual FastAPI backend — that's real Python
      // work (npm build + PyInstaller), not something to reimplement here.
      // Only these two prefixes are proxied, not all of /api, so they never
      // shadow the jsonFileApi routes above.
      '/api/generate-app-exe': 'http://127.0.0.1:50054',
      '/api/plc-test-connection': 'http://127.0.0.1:50054',
      '/api/build-plc-test-exe': 'http://127.0.0.1:50054',
      '/api/health': 'http://127.0.0.1:50054',
      '/api/reports': 'http://127.0.0.1:50054',
    },
  },
})
