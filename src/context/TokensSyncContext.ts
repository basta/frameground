import { createContext } from 'react'

export interface TokensSync {
  tokensCss: string
  overridesCss: string
}

export const TokensSyncContext = createContext<TokensSync>({ tokensCss: '', overridesCss: '' })
