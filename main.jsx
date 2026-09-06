import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { montaSegnala } from './lib/segnala.js'
import { avviaTelemetria } from './lib/telemetria.js'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Errore applicazione:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            maxWidth: 520,
            margin: '60px auto',
            padding: '28px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textAlign: 'center',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            background: '#fff',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: '#111827' }}>
            Si e' verificato un problema
          </h2>
          <p style={{ color: '#6b7280', margin: '0 0 20px' }}>
            La pagina ha avuto un errore ma i tuoi dati sono al sicuro sul foglio.
            Ricarica per continuare.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 22px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              background: '#2563eb',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Ricarica la pagina
          </button>
          {this.state.error ? (
            <pre
              style={{
                marginTop: 18,
                padding: 12,
                background: '#f9fafb',
                border: '1px solid #f3f4f6',
                borderRadius: 8,
                fontSize: 11,
                color: '#9ca3af',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {String(this.state.error?.message || this.state.error)}
            </pre>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);


// Bottone "Segnala un problema": chi usa l'app e' l'unico che vede
// davvero cosa non va, e deve poterlo dire in dieci secondi.
montaSegnala('magazzino')


// Sensori d'uso per il consulente migliorie: registra schermate, click
// ed errori, mai il contenuto. Vedi il commento in telemetria.js.
avviaTelemetria('magazzino')
