import { Buffer } from 'buffer'
window.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { TonConnectUIProvider, CHAIN } from '@tonconnect/ui-react'
import App from './App'
import './index.css'
import { TON_NETWORK } from './utils/config'

const MANIFEST_URL = 'https://tonyield-two.vercel.app/tonconnect-manifest.json'

// Select network based on config: testnet or mainnet
const networkChain = TON_NETWORK === 'testnet' ? CHAIN.TESTNET : CHAIN.MAINNET

ReactDOM.createRoot(document.getElementById('root')).render(
  <TonConnectUIProvider
    manifestUrl={MANIFEST_URL}
    network={networkChain}
  >
    <App />
  </TonConnectUIProvider>
)
