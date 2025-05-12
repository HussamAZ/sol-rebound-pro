// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // تأكد من استيراد App
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css');

const network = 'devnet';
const endpoint = clusterApiUrl(network);
const wallets = [new PhantomWalletAdapter()];

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* --- تأكد من وجود BrowserRouter هنا --- */}
    <BrowserRouter>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <App /> {/* <-- App يجب أن يكون بالداخل */}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </BrowserRouter>
    {/* ----------------------------------- */}
  </React.StrictMode>
);