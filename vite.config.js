import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { execSync } from 'child_process'

const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' } })()
const buildDate = new Date().toISOString()

/**
 * Vite plugin: resolves <!-- @include path/to/file.html --> directives
 * in index.html at both dev-serve and build time.
 */
function htmlIncludePlugin() {
  return {
    name: 'html-include',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Resolve includes relative to index.html's directory
        const base = ctx.filename ? dirname(ctx.filename) : process.cwd()
        return html.replace(/<!--\s*@include\s+(.+?)\s*-->/g, (_match, filePath) => {
          const absPath = resolve(base, filePath.trim())
          try {
            return readFileSync(absPath, 'utf-8')
          } catch (e) {
            console.error(`[html-include] Failed to include: ${absPath}`)
            throw e
          }
        })
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const pbUrl = env.VITE_PB_URL || ''
  const proxy = pbUrl
    ? {
        '/api': {
          target: pbUrl,
          changeOrigin: true
        }
      }
    : undefined

  return {
    base: '/gm/',
    plugins: [htmlIncludePlugin(), vue()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(commit),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
    resolve: {
      alias: {
        'vue': 'vue/dist/vue.esm-bundler.js'
      }
    },
    server: {
      port: 8081,
      host: 'localhost', // use 'true' for same-WiFi iPhone access (may fail in some envs)
      open: true,
      // Prevent caching so iPhone always gets latest (proxy + same-origin)
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      },
      // Proxy PocketBase so iPhone (same-origin) gets data without CORS
      proxy
    }
  }
})
