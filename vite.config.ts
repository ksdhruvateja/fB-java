import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import { execSync } from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function resolveBuildStamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return sha || `t${Date.now()}`
  } catch {
    return `t${Date.now()}`
  }
}

const BUILD_STAMP = resolveBuildStamp()

function resolveSiteUrl(): string {
  const raw = process.env.VITE_SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://fixbridge.us'
  return raw.replace(/\/$/, '')
}

function injectSiteMeta(): Plugin {
  const siteUrl = resolveSiteUrl()
  return {
    name: 'inject-site-meta',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl)
    },
  }
}

/** Strip version suffixes like `@1.2.3` from Figma Make imports. */
function removeVersionSpecifiers(): Plugin {
  const VERSION_PATTERN = /@\d+\.\d+\.\d+/
  return {
    name: 'remove-version-specifiers',
    resolveId(id, importer) {
      if (VERSION_PATTERN.test(id)) {
        const cleanId = id.replace(VERSION_PATTERN, '')
        return this.resolve(cleanId, importer, { skipSelf: true })
      }
      return null
    },
  }
}

/** Resolve `figma:asset/...` imports to local assets. */
function figmaAssetsResolver(): Plugin {
  const FIGMA_ASSETS_PREFIX = 'figma:asset/'
  return {
    name: 'figma-assets-resolver',
    resolveId(id) {
      if (id.startsWith(FIGMA_ASSETS_PREFIX)) {
        const assetPath = id.slice(FIGMA_ASSETS_PREFIX.length)
        return path.resolve(__dirname, './src/assets', assetPath)
      }
      return null
    },
  }
}

function resolveApiProxyTarget(env: Record<string, string>): string {
  const fromUrl = String(env.API_BASE_URL || env.API_BASE || '').trim().replace(/\/$/, '')
  if (fromUrl) return fromUrl
  const port = String(env.API_PORT || '3001').trim() || '3001'
  return `http://127.0.0.1:${port}`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = resolveApiProxyTarget(env)

  return {
    plugins: [react(), tailwindcss(), figmaAssetsResolver(), removeVersionSpecifiers(), injectSiteMeta()],
    define: {
      __FIXBRIDGE_BUILD__: JSON.stringify(BUILD_STAMP),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    server: {
      host: '0.0.0.0',
      port: 5000,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
