import { defineConfig, type Plugin } from 'vite'
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

export default defineConfig({
  plugins: [react(), tailwindcss(), figmaAssetsResolver(), removeVersionSpecifiers()],
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
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
