import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBucaStore } from './store/bucaStore';
import { useJovieStore } from './store/jovieStore';
import { getMultipleCaregiverRows } from './utils/multipleCaregiver';
import { AppProvider } from './context/AppContext';
import * as api from './api';
import CopyCell from './CopyCell';
import { formatTime12hRange } from './utils/formatting';
import BcasTab from './panels/CaseNrPanel';
import { useExchangeStore } from './store/bucaStore';
import usePersistentStore from './store/persistentStore';

// Logo bar styles
const LOGO_BAR_STYLE = "sticky top-0 z-30 bg-white flex items-center border-b mb-2 px-4 py-2";
const ORANGE = 'text-orange-600';

function LogoBar() {
  return (
    <header className={LOGO_BAR_STYLE} style={{minHeight: 48}}>
      <a href="/" className="flex items-center">
        <img src="/app_icon.ico" alt="CaseConWeb Logo" className="h-8 w-8 mr-3 rounded shadow" style={{display:'block'}} />
        <span
          className="select-none text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 bg-clip-text text-transparent drop-shadow-md flex items-baseline"
          style={{ fontFamily: 'Poppins, Arial, sans-serif', textShadow: '1px 1px 3px rgba(0,0,0,0.2)' }}
        >
          <span
            style={{
              fontWeight: 900,
              letterSpacing: '2px',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              backgroundImage: 'linear-gradient(90deg, #e0e0e0 0%, #b0b0b0 50%, #f8f8f8 100%)',
              marginRight: 10,
            }}
            className="uppercase"
          >
            JOVIE
          </span>
          <span
            style={{
              fontWeight: 800,
              letterSpacing: '1.5px',
              color: '#fb923c',
              textShadow: '1px 1px 3px rgba(0,0,0,0.18)'
            }}
            className="ml-1"
          >
            Data Processor
          </span>
        </span>
      </a>
    </header>
  );
}

const TAB_NAMES = ['BUCA', 'JOVIE', 'Compare', 'TimeCK', 'BCAS', 'RECON', 'UID Registry', 'Admin Desk'];

// --- BUCA MODULE LOADER ---
function BucaModule() {
  const [BucaPanel, setBucaPanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadBucaModule = async () => {
      try {
        // Dynamically import the BucaPanel component
        const module = await import('./components/BucaPanel');
        const Comp = module && module.default;
        // Guard: ensure we have a callable React component, not an asset/string
        if (typeof Comp !== 'function') {
          throw new Error('BUCA module default export is not a React component');
        }
        setBucaPanel(() => Comp);
      } catch (err) {
        console.error('Failed to load BUCA module:', err);
        setError('The BUCA module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

  // Fallback: parse UID tokens from name strings, e.g., "Amy Olthouse[UID-0001-MAST]"
  const injectParsedUIDs = (rows) => {
    if (!Array.isArray(rows)) return rows || [];
    const uidRegex = /\[(UID-[^\]]+?)\]/i; // captures content like UID-0001-MAST
    const extract = (s) => {
      if (!s || typeof s !== 'string') return '';
      const m = s.match(uidRegex);
      return m ? m[1] : '';
    };
    return rows.map(r => {
      const out = { ...r };
      // If no pair/master UID present, try to parse from either client or caregiver label
      const hasPair = out.mast_uid || out.MAST_UID || out.master_uid || out.MASTER_UID || out.pair_uid || out.pairUID || out.uid || out.UID || out.id;
      if (!hasPair) {
        const fromClient = extract(out.client);
        const fromCare = extract(out.caregiver);
        // If either contains a token ending with -MAST, treat as pair/master UID
        const mastToken = [fromClient, fromCare].find(t => /-MAST$/i.test(t));
        if (mastToken) {
          out.mast_uid = mastToken; // standardize into mast_uid for comparator
        } else {
          // Otherwise, store as component UIDs if present
          if (fromClient) out.client_mast_uid = fromClient;
          if (fromCare) out.caregiver_mast_uid = fromCare;
        }
      }
      return out;
    });
  };

    loadBucaModule();
  }, []);

  if (loading) return <div>Loading BUCA module...</div>;
  
  if (error || !BucaPanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">BUCA Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the BUCA module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Uses: useBucaStore for state management</li>
                <li>• Location: /src/components/BucaPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render the BucaPanel with its required props
  return <BucaPanel onStatusUpdate={(status) => console.log('BUCA Status:', status)} />;
}

// Keep the original BucaPanel name for the tab system
const BucaPanel = BucaModule;

// --- JOVIE MODULE LOADER ---
function JovieModule(props) {
  const [JoviePanel, setJoviePanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadJovieModule = async () => {
      try {
        // Dynamically import the JoviePanel component
        const module = await import('./components/JoviePanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('JOVIE module default export is not a React component');
        }
        setJoviePanel(() => Comp);
      } catch (err) {
        console.error('Failed to load JOVIE module:', err);
        setError('The JOVIE module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadJovieModule();
  }, []);

  if (loading) return <div>Loading JOVIE module...</div>;
  
  if (error || !JoviePanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">JOVIE Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the JOVIE module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Uses: useJovieStore for state management</li>
                <li>• Location: /src/components/JoviePanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render the JoviePanel with forwarded props
  return <JoviePanel {...props} />;
}

// Keep the original JoviePanel name for the tab system
const JoviePanel = JovieModule;

// --- COMPARE MODULE LOADER ---
function CompareModule({
  onCompare,
  onClearResults,
  onExport,
  rows = []
}) {
  const [ComparePanel, setComparePanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadCompareModule = async () => {
      try {
        // Dynamically import the ComparePanel component
        const module = await import('./components/ComparePanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('Compare module default export is not a React component');
        }
        setComparePanel(() => Comp);
      } catch (err) {
        console.error('Failed to load Compare module:', err);
        setError('The Compare module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadCompareModule();
  }, []);

  if (loading) return <div>Loading Compare module...</div>;
  
  if (error || !ComparePanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Compare Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the Compare module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Props: rows, onCompare, onClearResults, onExport</li>
                <li>• Location: /src/components/ComparePanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render the ComparePanel with all required props
  return (
    <ComparePanel
      onCompare={onCompare}
      onClearResults={onClearResults}
      onExport={onExport}
      rows={rows}
    />
  );
}

// Keep the original ComparePanel name for the tab system
const ComparePanel = CompareModule;

// --- NAME ID REGISTRY MODULE LOADER ---
function NameIDRegistryModule() {
  const [NameIDRegistryPanel, setNameIDRegistryPanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadNameIDRegistryModule = async () => {
      try {
        // Dynamically import the NameIDRegistryPanel component (updated location)
        const module = await import('./components/NameIDRegistryPanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('Name ID Registry module default export is not a React component');
        }
        setNameIDRegistryPanel(() => Comp);
      } catch (err) {
        console.error('Failed to load Name ID Registry module:', err);
        setError('The Name ID Registry module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadNameIDRegistryModule();
  }, []);

  if (loading) return <div>Loading Name ID Registry module...</div>;
  
  if (error || !NameIDRegistryPanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-2M9 5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Name ID Registry</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the Name ID Registry module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Props: (none required yet)</li>
                <li>• Location: /src/components/NameIDRegistryPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render the NameIDRegistryPanel with any required props
  return <NameIDRegistryPanel />;
}

// Keep the original NameIDRegistryPanel name for the tab system
const NameIDRegistryPanel = NameIDRegistryModule;

// --- BCAS MODULE LOADER ---
function BCASModule(props) {
  const [BCASPanel, setBCASPanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadBCASModule = async () => {
      try {
        // Dynamically import the BCASPanel component
        const module = await import('./components/BCASPanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('BCAS module default export is not a React component');
        }
        setBCASPanel(() => Comp);
      } catch (err) {
        console.error('Failed to load BCAS module:', err);
        setError('The BCAS module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadBCASModule();
  }, []);

  if (loading) return <div className="p-4">Loading BCAS module...</div>;
  
  if (error || !BCASPanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">BCAS Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the BCAS verification module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Props: rows, onRecon, onReport</li>
                <li>• Location: /src/components/BCASPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Get the required props from the parent component
  const { rows, onRecon, onReport } = props;
  
  // Render the BCASPanel with its required props
  return <BCASPanel rows={rows} onRecon={onRecon} onReport={onReport} />;
}

// Keep the original name for the tab system
const CaseNrVerificationPanel = BCASModule;

// --- RECON MODULE LOADER ---
function ReconModule(props) {
  const [ReconPanel, setReconPanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadReconModule = async () => {
      try {
        // Dynamically import the ReconPanel component
        const module = await import('./components/ReconPanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('RECON module default export is not a React component');
        }
        setReconPanel(() => Comp);
      } catch (err) {
        console.error('Failed to load RECON module:', err);
        setError('The RECON module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadReconModule();
  }, []);

  if (loading) return <div className="p-4">Loading RECON module...</div>;
  
  if (error || !ReconPanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">RECON Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the RECON module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Location: /src/components/ReconPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Forward any props if needed
  return <ReconPanel {...props} />;
}

// Keep the original name for the tab system
const ReconPanel = ReconModule;

// --- RESULTS MODULE LOADER ---
function ResultsModule(props) {
  const [ResultsPanel, setResultsPanel] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadResultsModule = async () => {
      try {
        // Dynamically import the TimeCKPanel component
        const module = await import('./components/TimeCKPanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('TimeCK module default export is not a React component');
        }
        setResultsPanel(() => Comp);
      } catch (err) {
        console.error('Failed to load TimeCK module:', err);
        setError('The TimeCK module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadResultsModule();
  }, []);

  if (loading) return <div className="p-4">Loading TimeCK module...</div>;
  
  if (error || !ResultsPanel) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">TimeCK Module</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the TimeCK module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-left text-sm text-gray-700 space-y-2">
                <li>• Module Name: TimeCK</li>
                <li>• Props: rows, onClearResults, onExport</li>
                <li>• Location: /src/components/TimeCKPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Get the required props from the parent component
  const { rows, onClearResults, onExport } = props;
  
  // Render the TimeCKPanel with its required props
  return <ResultsPanel rows={rows} onClearResults={onClearResults} onExport={onExport} />;
}

// Keep the original name for the tab system
const ResultsPanel = ResultsModule;

// --- ADMIN DESK MODULE LOADER ---
function AdminDeskModule(props) {
  const [AdminDeskView, setAdminDeskView] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const loadDEVModule = async () => {
      try {
        // Dynamically import the AdminDeskPanel component
        const module = await import('./components/AdminDeskPanel');
        const Comp = module && module.default;
        if (typeof Comp !== 'function') {
          throw new Error('Admin Desk module default export is not a React component');
        }
        setAdminDeskView(() => Comp);
      } catch (err) {
        console.error('Failed to load Admin Desk module:', err);
        setError('The Admin Desk module is currently unplugged.');
      } finally {
        setLoading(false);
      }
    };

    loadDEVModule();
  }, []);

  if (loading) return <div className="p-4">Loading Admin Desk...</div>;
  
  if (error || !AdminDeskView) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Admin Desk</h2>
            <p className="text-gray-600 mb-6">This tab is a socket for the Admin Desk (Snapshot Manager) module.</p>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 w-full text-left">
              <h3 className="font-medium text-gray-700 mb-2">Module Interface</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Provides Snapshot Save/Load management UI</li>
                <li>• Location: /src/components/AdminDeskPanel.js</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Get any required props from the parent component if needed
  // const { prop1, prop2 } = props;
  
  // Render the DEVPanel with any required props
  return <AdminDeskView />;
}

// Keep the original name style for the tab system
const AdminDeskPanel = AdminDeskModule;

// --- MAIN PANEL SWITCH ---
function MainPanel(props) {
  const bucaRows = useBucaStore(state => state.bucaRows);

  const { currentTab, bucaText, setBucaText, jovieText, setJovieText, rows, onProcess, onClear, onIdentify, onExport, onCompare, onRecon, onReport, onClearResults, jovieDate, onJovieStatusUpdate, showCorrectionsModal, setShowCorrectionsModal, correctionsRows, setCorrectionsRows, handleSaveCorrections, handleTempCorrection, universalCorrectionsOpen, setUniversalCorrectionsOpen, corrections, fetchCorrections, onResultEdit } = props;
  switch (currentTab) {
    case 0:
      return <BucaPanel bucaText={bucaText} setBucaText={setBucaText} onProcess={onProcess} onClear={onClear} onIdentify={onIdentify} onExport={onExport} />;
    case 1:
      return <JoviePanel jovieText={jovieText} setJovieText={setJovieText} onProcess={onProcess} onClear={onClear} onExport={onExport} jovieDate={jovieDate} onStatusUpdate={onJovieStatusUpdate} />;
    case 2:
      return <ComparePanel 
        onCompare={onCompare}
        onClearResults={onClearResults}
        onExport={onExport}
        rows={rows}
      />;
    // --- RESULTS MODULE ---
    case 3:
      return <ResultsPanel 
        rows={rows}
        onClearResults={onClearResults}
        onExport={onExport}
        onResultEdit={onResultEdit}
      />;

    // --- BCAS MODULE ---
    case 4:
      return <CaseNrVerificationPanel rows={bucaRows} onRecon={onRecon} onReport={onReport} />;

    // --- RECON MODULE ---
    case 5:
      return <ReconPanel rows={props.reconRows} />;

    // --- UID REGISTRY MODULE ---
    case 6:
      return <NameIDRegistryPanel 
        // Add any required props here when implementing
      />;

    // --- DEV MODULE ---
    case 7:
      return <AdminDeskPanel />;
    default:
      return null;
  }
}

function OrangeTabs({ current, setCurrent }) {
  return (
    <div className="flex border-b bg-white">
      {TAB_NAMES.map((tab, idx) => (
        <button
          key={tab}
          className={`px-6 py-2 font-semibold border-b-4 transition-colors duration-200 focus:outline-none ${current===idx?'border-orange-500 text-orange-600':'border-transparent text-gray-600 hover:text-orange-500'}`}
          onClick={() => setCurrent(idx)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

 

export default function App() {
  // ...other state/hooks

  // Per-row corrections modal state (for Identify CG)
  const [showCorrectionsModal, setShowCorrectionsModal] = useState(false);
  const [correctionsRows, setCorrectionsRows] = useState([]);
  // Universal corrections modal state
  const [universalCorrectionsOpen, setUniversalCorrectionsOpen] = useState(false);
  // Universal corrections list
  const [corrections, setCorrections] = useState([]);
  // Save a user correction for a Temporary Mismatch and update UI
  // Fetch corrections from backend
  const fetchCorrections = async () => {
    try {
      const result = await api.getCorrections();
      setCorrections(result.corrections || []);
    } catch {}
  };

  const handleTempCorrection = async (correctionObj, selectedVersion) => {
    await api.addCorrection(correctionObj);
    await fetchCorrections();
    await handleCompare();
  }

  React.useEffect(() => { fetchCorrections(); }, []);

  const [currentTab, setCurrentTab] = useState(0);
  const [bucaText, setBucaText] = useState('');
  const [jovieText, setJovieText] = useState('');
  const bucaRows = useBucaStore(state => state.bucaRows);
  const setBucaRows = useBucaStore(state => state.setBucaRows);
  const jovieRows = useJovieStore(state => state.jovieRows);
  const setJovieRows = useJovieStore(state => state.setJovieRows);
  const [jovieDate, setJovieDate] = useState(null);
  const [rows, setRows] = useState([]); // For analysis/results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Publish to exchange: BCAS normalized cases whenever bucaRows change
  const setBucaCases = useExchangeStore(s => s.setBucaCases);
  const setTimeByCase = useExchangeStore(s => s.setTimeByCase);
  const getReconRows = useExchangeStore(s => s.getReconRows);
  const reconRows = useMemo(() => getReconRows(), [getReconRows, bucaRows, rows]);
  const sanitizeCase = (val) => typeof val === 'string' ? val.replace(/\s*(?:Date:|ESTCaregiver:).*$/i, '').trim() : (val || '');
  const debugLogs = usePersistentStore(s => s.debugLogs);

  useEffect(() => {
    const normalized = (bucaRows || []).map((b, idx) => ({
      line: b.line ?? b.row ?? (idx + 1),
      client: b.client || '',
      caregiver: Array.isArray(b.caregivers) ? b.caregivers.join(', ') : (b.caregiver || ''),
      caseNumber: sanitizeCase(b.caseNumber),
    }));
    setBucaCases(normalized);
  }, [bucaRows, setBucaCases]);

  // Publish to exchange: TimeCK times by case whenever rows change
  useEffect(() => {
    const mapObj = {};
    try {
      const src = Array.isArray(rows) ? rows : [];
      // Diagnostic: log incoming rows count and a couple of examples
      if (debugLogs) {
        console.log('[Recon][timeByCase] rows length:', src.length);
        if (src.length > 0) {
          const peek = src.slice(0, Math.min(3, src.length)).map((r, i) => ({
            i,
            caseNumber: r && r.caseNumber,
            timeChecked: r && r.timeChecked,
            result: r && r.result,
            time: r && r.time,
          }));
          console.log('[Recon][timeByCase] rows peek:', peek);
        }
      }
      src.forEach((r) => {
        const cn = sanitizeCase(r && r.caseNumber);
        const time = ((r && (r.timeChecked ?? r.result ?? r.time)) ?? '').toString();
        if (cn) mapObj[cn.toLowerCase()] = time;
      });
      setTimeByCase(mapObj);
      // Diagnostic: log mapping size and a few samples
      if (debugLogs) {
        const keys = Object.keys(mapObj);
        console.log('[Recon][timeByCase] map size:', keys.length);
        if (keys.length) {
          const sample = keys.slice(0, Math.min(5, keys.length)).reduce((acc, k) => { acc[k] = mapObj[k]; return acc; }, {});
          console.log('[Recon][timeByCase] sample mapping:', sample);
        }
      }
    } catch (e) {
      console.warn('[Recon][timeByCase] failed to build map:', e);
      setTimeByCase(mapObj);
    }
  }, [rows, setTimeByCase]);

  // After a snapshot is applied, optionally jump to saved tab and auto-run compare once
  useEffect(() => {
    let fired = false;
    const handler = (e) => {
      const ui = (e && e.detail && e.detail.ui) || {};
      if (typeof ui.activeTab === 'number') {
        setCurrentTab(ui.activeTab);
      }
      // Only auto-compare once per event; run if there is BUCA+JOVIE data but no results yet
      const hasInputs = Array.isArray(bucaRows) && bucaRows.length > 0 && Array.isArray(jovieRows) && jovieRows.length > 0;
      const hasResults = Array.isArray(rows) && rows.length > 0;
      if (!fired && hasInputs && !hasResults) {
        fired = true;
        // Let React apply state updates first
        setTimeout(() => { try { handleCompare(); } catch {} }, 0);
      }
    };
    window.addEventListener('casecon:snapshot-applied', handler);
    return () => window.removeEventListener('casecon:snapshot-applied', handler);
  }, [bucaRows, jovieRows, rows]);

  // BUCA tab: process BUCA text and update BUCA table only
  const handleProcessBuca = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.processBuca(bucaText);
      let sortedRows = (result.rows || []).sort((a, b) => (a.client || '').localeCompare(b.client || ''));
      setBucaRows(sortedRows);
    } catch (e) {
      setError('Failed to process BUCA data');
    } finally {
      setLoading(false);
    }
  };

  // JOVIE tab: process JOVIE text and update JOVIE table only
  const handleProcessJovie = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.processJovie(jovieText);
      setJovieRows(result.rows || []);
      setJovieDate(result.date || null);
    } catch (e) {
      setError('Failed to process JOVIE data');
      setJovieDate(null);
    } finally {
      setLoading(false);
    }
  };

  // Enrich rows with UIDs from the UID Registry API
  const enrichWithUIDs = async (rows, sideLabel) => {
    if (!rows || !rows.length) return rows || [];
    const base = process.env.REACT_APP_UID_API_URL || '';
    const url = base.endsWith('/resolve') ? base : `${base.replace(/\/$/, '')}/resolve`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      });
      if (!res.ok) throw new Error(`UID resolve failed ${res.status}`);
      const data = await res.json();
      let resolved = null;
      if (Array.isArray(data) && data.length === rows.length) {
        resolved = data;
      } else if (data && Array.isArray(data.results) && data.results.length === rows.length) {
        resolved = data.results;
      }
      if (!resolved) {
        console.warn(`[UID] Unexpected response shape for ${sideLabel}. Using original rows.`, data);
        return rows;
      }
      // Merge field-wise, prefer resolved values when present
      return rows.map((r, i) => ({ ...r, ...resolved[i] }));
    } catch (e) {
      console.warn(`[UID] Failed to enrich ${sideLabel}:`, e);
      return rows;
    }
  };

  // Fallback parser to inject UIDs from bracket tokens in client/caregiver strings
  const injectParsedUIDs = (rows) => {
    if (!Array.isArray(rows)) return rows || [];
    const uidRegex = /\[(UID-[^\]]+?)\]/i;
    const extract = (s) => {
      if (!s || typeof s !== 'string') return '';
      const m = s.match(uidRegex);
      return m ? m[1] : '';
    };
    return rows.map((r) => {
      const row = { ...r };
      const hasPair = row.mast_uid || row.MAST_UID || row.master_uid || row.MASTER_UID || row.pair_uid || row.pairUID || row.uid || row.UID || row.id;
      if (!hasPair) {
        const fromClient = extract(row.client);
        const fromCare = extract(row.caregiver);
        const mastToken = [fromClient, fromCare].find(t => /-MAST$/i.test(t));
        if (mastToken) {
          row.mast_uid = mastToken;
        } else {
          if (fromClient) row.client_mast_uid = fromClient;
          if (fromCare) row.caregiver_mast_uid = fromCare;
        }
      }
      return row;
    });
  };

  // Analysis: compare BUCA & JOVIE locally using UID when available (fallback to client+caregiver)
  const handleCompare = async () => {
    setLoading(true); setError('');
    try {
      const norm = s => (s || '').toString().trim().toLowerCase();
      const getField = (obj, names) => {
        for (const n of names) {
          const v = obj?.[n];
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };
      // Extract canonical UIDs from a row
      const pickUIDs = (r) => {
        const pair = getField(r, ['mast_uid','MAST_UID','master_uid','MASTER_UID','pair_uid','pairUID','uid','UID','id']);
        const c = getField(r, ['clientUID','client_uid','clientId','client_id','client_mast_uid','CLIENT_MAST_UID','client_master_uid','CLIENT_MASTER_UID']);
        const g = getField(r, ['caregiverUID','caregiver_uid','caregiverId','caregiver_id','cg_uid','cgUID','caregiver_mast_uid','CAREGIVER_MAST_UID','caregiver_master_uid','CAREGIVER_MASTER_UID']);
        return {
          pair: pair,
          client: c,
          caregiver: g,
        };
      };
      const pickDate = (r) => getField(r, ['date','service_date','DATE','SERVICE_DATE']);
      const pickTimeRange = (r) => {
        const tr = getField(r, ['timeRange','timerange','TIME_RANGE','TIME','time']);
        if (tr) return tr;
        const s = getField(r, ['start_time','startTime','START_TIME']);
        const e = getField(r, ['end_time','endTime','END_TIME']);
        if (s || e) {
          try { return formatTime12hRange({ start: s, end: e }); } catch {}
          return [s, e].filter(Boolean).join('-');
        }
        return '';
      };

      // First, enrich rows with UIDs from the registry
      const bucaEnrichedRaw = await enrichWithUIDs(bucaRows || [], 'BUCA');
      const jovieEnrichedRaw = await enrichWithUIDs(jovieRows || [], 'JOVIE');
      // Apply parsing fallback so comparison doesn't break when backend enrichment isn't available
      const bucaEnriched = injectParsedUIDs(bucaEnrichedRaw);
      const jovieEnriched = injectParsedUIDs(jovieEnrichedRaw);

      // Build JOVIE indexes
      const jovieByPair = new Map(); // pair UID -> row
      const jovieByComposite = new Map(); // c|g -> row
      const jovieByClient = new Map(); // client UID -> rows (array)
      const jovieByCare = new Map(); // caregiver UID -> rows (array)
      const jovieNoUid = [];
      for (const r of jovieEnriched || []) {
        const u = pickUIDs(r);
        const cKey = norm(u.client);
        const gKey = norm(u.caregiver);
        const pKey = norm(u.pair);
        if (pKey) jovieByPair.set(pKey, r);
        if (cKey && gKey) jovieByComposite.set(`${cKey}|${gKey}`, r);
        if (cKey) {
          const arr = jovieByClient.get(cKey) || [];
          arr.push(r);
          jovieByClient.set(cKey, arr);
        }
        if (gKey) {
          const arr = jovieByCare.get(gKey) || [];
          arr.push(r);
          jovieByCare.set(gKey, arr);
        }
        if (!pKey && !cKey && !gKey) jovieNoUid.push(r);
      }

      // Compare using priority: (1) client+caregiver match, (2) client only or caregiver only -> verify, (3) pair UID match, else mismatch
      const usedJovie = new Set();
      const results = [];
      for (const b of bucaEnriched || []) {
        const u = pickUIDs(b);
        const cKey = norm(u.client);
        const gKey = norm(u.caregiver);
        const pKey = norm(u.pair);

        let matched = false;
        // 1) Composite match (client & caregiver)
        if (cKey && gKey) {
          const jr = jovieByComposite.get(`${cKey}|${gKey}`);
          if (jr && !usedJovie.has(jr)) {
            usedJovie.add(jr);
            results.push({
              source: 'BOTH',
              client: b.client || jr.client || '',
              caregiver: b.caregiver || jr.caregiver || '',
              match_type: 'Exact Match',
              tag: 'exact_match',
              // Include both caregivers for UI comparisons
              bucaCaregiver: b.caregiver || '',
              jovieCaregiver: jr.caregiver || '',
              // identifiers for TimeCK
              clientUID: pickUIDs(jr).client || pickUIDs(b).client,
              caregiverUID: pickUIDs(jr).caregiver || pickUIDs(b).caregiver,
              mast_uid: pickUIDs(jr).pair || pickUIDs(b).pair,
              date: pickDate(jr) || pickDate(b),
              timeRange: pickTimeRange(jr) || pickTimeRange(b),
              caseNumber: b.caseNumber,
            });
            matched = true;
            continue;
          }
        }
        // 2) Partial: client-only or caregiver-only -> verify
        if (!matched && cKey) {
          const jrList = jovieByClient.get(cKey) || [];
          const jr = jrList.find(x => !usedJovie.has(x));
          if (jr) {
            usedJovie.add(jr);
            results.push({
              source: 'BOTH',
              client: b.client || jr.client || '',
              caregiver: b.caregiver || jr.caregiver || '',
              match_type: 'Verify Which CG',
              tag: 'verify_cg',
              // For UI display: show both caregivers on consolidated row
              bucaCaregiver: b.caregiver || '',
              jovieCaregiver: jr.caregiver || '',
              clientUID: pickUIDs(jr).client || pickUIDs(b).client,
              caregiverUID: pickUIDs(jr).caregiver || pickUIDs(b).caregiver,
              mast_uid: pickUIDs(jr).pair || pickUIDs(b).pair,
              date: pickDate(jr) || pickDate(b),
              timeRange: pickTimeRange(jr) || pickTimeRange(b),
              caseNumber: b.caseNumber,
            });
            matched = true;
            continue;
          }
        }
        if (!matched && gKey) {
          const jrList = jovieByCare.get(gKey) || [];
          const jr = jrList.find(x => !usedJovie.has(x));
          if (jr) {
            usedJovie.add(jr);
            results.push({
              source: 'BOTH',
              client: b.client || jr.client || '',
              caregiver: b.caregiver || jr.caregiver || '',
              match_type: 'Verify Which CG',
              tag: 'verify_cg',
              bucaCaregiver: b.caregiver || '',
              jovieCaregiver: jr.caregiver || '',
              clientUID: pickUIDs(jr).client || pickUIDs(b).client,
              caregiverUID: pickUIDs(jr).caregiver || pickUIDs(b).caregiver,
              mast_uid: pickUIDs(jr).pair || pickUIDs(b).pair,
              date: pickDate(jr) || pickDate(b),
              timeRange: pickTimeRange(jr) || pickTimeRange(b),
              caseNumber: b.caseNumber,
            });
            matched = true;
            continue;
          }
        }
        // 3) Pair UID match as a fallback
        if (!matched && pKey) {
          const jr = jovieByPair.get(pKey);
          if (jr && !usedJovie.has(jr)) {
            usedJovie.add(jr);
            results.push({
              source: 'BOTH',
              client: b.client || jr.client || '',
              caregiver: b.caregiver || jr.caregiver || '',
              match_type: 'Exact Match',
              tag: 'exact_match',
              // Include both caregivers for UI comparisons
              bucaCaregiver: b.caregiver || '',
              jovieCaregiver: jr.caregiver || '',
              clientUID: pickUIDs(jr).client || pickUIDs(b).client,
              caregiverUID: pickUIDs(jr).caregiver || pickUIDs(b).caregiver,
              mast_uid: pickUIDs(jr).pair || pickUIDs(b).pair,
              date: pickDate(jr) || pickDate(b),
              timeRange: pickTimeRange(jr) || pickTimeRange(b),
              caseNumber: b.caseNumber,
            });
            matched = true;
            continue;
          }
        }
        // 4) No match found -> BUCA only mismatch
        results.push({
          source: 'BUCA only',
          client: b.client || '',
          caregiver: b.caregiver || '',
          match_type: 'Complete Mismatch',
          tag: 'complete_mismatch',
          clientUID: pickUIDs(b).client,
          caregiverUID: pickUIDs(b).caregiver,
          mast_uid: pickUIDs(b).pair,
          date: pickDate(b),
          timeRange: pickTimeRange(b),
          caseNumber: b.caseNumber,
        });
      }

      // Add remaining JOVIE rows that were not used
      for (const j of jovieEnriched || []) {
        if (!usedJovie.has(j)) {
          results.push({
            source: 'JOVIE only',
            client: j.client || '',
            caregiver: j.caregiver || '',
            match_type: 'Complete Mismatch',
            tag: 'complete_mismatch',
            clientUID: pickUIDs(j).client,
            caregiverUID: pickUIDs(j).caregiver,
            mast_uid: pickUIDs(j).pair,
            date: pickDate(j),
            timeRange: pickTimeRange(j),
          });
        }
      }

      // Debug summary to understand mismatches due to missing UIDs
      try {
        console.info('[Compare] BUCA rows:', (bucaEnriched||[]).length);
        console.info('[Compare] JOVIE rows:', (jovieEnriched||[]).length);
      } catch {}

      // Sort by client for stable display
      results.sort((a, b) => (a.client || '').localeCompare(b.client || ''));
      setRows(results);
    } catch (e) {
      console.error('Comparison failed:', e);
      setError('Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  // Export to Excel
  const handleExport = async () => {
    setLoading(true); setError('');
    try {
      const blob = await api.exportResults();
      const defaultName = 'CaseConTimeCK.xlsx';
      if (window.showSaveFilePicker) {
        const fileHandle = await window.showSaveFilePicker({
          types: [
            {
              description: 'Excel file',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        let filename = window.prompt('Enter file name for export:', defaultName);
        if (!filename) return;
        if (!filename.endsWith('.xlsx')) filename += '.xlsx';
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          a.remove();
        }, 100);
      }
    } catch (e) {
      setError('Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setBucaText('');
    setJovieText('');
    setRows([]);
    setError('');
  };

  // Open corrections modal for BUCA rows with multiple caregivers
  const handleIdentify = async () => {
    const flagged = getMultipleCaregiverRows(bucaRows);
    setCorrectionsRows(flagged);
    setShowCorrectionsModal(flagged.length > 0);
  };

  // Save corrections to backend and update table
  const handleSaveCorrections = (corr) => {
    setShowCorrectionsModal(false);
    let updated = bucaRows.map(row => {
      const found = corr.find(c => c.row === row.row);
      if (found && found.caregivers && found.caregivers.length > 0) {
        let newRaw = row.raw.replace(
          /(ESTCaregiver:\s*)([^,\/&and]*)(.*)$/i,
          `$1${found.caregivers[0]}`
        );
        return { ...row, caregivers: found.caregivers, raw: newRaw };
      }
      return row;
    });
    const deduped = Object.values(updated.reduce((acc, row) => {
      if (row.row !== undefined && row.row !== null) {
        acc[row.row] = row;
      } else {
        const key = `${row.client || ''}|${row.caseNumber || ''}`;
        acc[key] = row;
      }
      return acc;
    }, {}));
    const sorted = [...deduped].sort((a, b) => (a.client || '').localeCompare(b.client || ''));
    setBucaRows(sorted);
    setBucaText(sorted.map(row => row.raw).join('\n'));
  };

  const handleRecon = () => { alert('Recon Now feature coming soon!'); };
  const handleReport = () => { alert('Report feature coming soon!'); };
  const handleClearResults = () => { setRows([]); setError(''); };

  // Update a single row's Result/timeChecked when user pastes a time range in TimeCK
  const handleResultEdit = (index, value) => {
    setRows(prev => prev.map((r, i) => (
      i === index ? { ...r, result: value, timeChecked: value } : r
    )));
  };

  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <LogoBar />
        <div className="bg-white shadow mb-4">
          <OrangeTabs current={currentTab} setCurrent={setCurrentTab} />
          <div className="text-center text-xs text-gray-500 mb-2">
            {jovieDate
              ? <span className="font-bold">{jovieDate}</span>
              : currentTab === 0
                ? 'Ready to process BUCA data'
                : currentTab === 1
                  ? 'Ready to process JOVIE data'
                  : currentTab === 2
                    ? 'Ready to compare BUCA and JOVIE data'
                    : currentTab === 3
                      ? 'Ready to view results'
                      : currentTab === 4
                        ? 'Ready for case number verification'
                        : currentTab === 5
                          ? 'Ready for recon'
                        : ''}
          </div>
        </div>
        <main className="flex-1 max-w-5xl mx-auto w-full">
          {loading && <div className="text-center text-orange-600 py-2">Loading...</div>}
          {error && <div className="text-center text-red-600 py-2">{error}</div>}
          <div className="mb-6">
            <MainPanel
              currentTab={currentTab}
              bucaText={bucaText}
              setBucaText={setBucaText}
              jovieText={jovieText}
              setJovieText={setJovieText}
              rows={rows}
              onProcess={currentTab === 0 ? handleProcessBuca : currentTab === 1 ? handleProcessJovie : undefined}
              onClear={handleClear}
              onIdentify={handleIdentify}
              onExport={handleExport}
              onCompare={handleCompare}
              onRecon={handleRecon}
              onReport={handleReport}
              onClearResults={handleClearResults}
              jovieDate={jovieDate}
              onJovieStatusUpdate={(payload) => {
                // Support both string and object payloads for backward compatibility
                try {
                  if (payload && typeof payload === 'object') {
                    if (payload.date !== undefined) setJovieDate(payload.date || null);
                  } else if (typeof payload === 'string') {
                    // Attempt to parse a date from the message (after 'Date: ')
                    const m = payload.match(/Date:\s*([^|•]+)$/i);
                    if (m && m[1]) setJovieDate(m[1].trim());
                  }
                } catch {}
              }}
              showCorrectionsModal={showCorrectionsModal}
              setShowCorrectionsModal={setShowCorrectionsModal}
              correctionsRows={correctionsRows}
              setCorrectionsRows={setCorrectionsRows}
              handleTempCorrection={handleTempCorrection}
              handleSaveCorrections={handleSaveCorrections}
              universalCorrectionsOpen={universalCorrectionsOpen}
              setUniversalCorrectionsOpen={setUniversalCorrectionsOpen}
              corrections={corrections}
              fetchCorrections={fetchCorrections}
              onResultEdit={handleResultEdit}
              reconRows={reconRows}
            />  
          </div>
        </main>
        <footer className="bg-gray-100 border-t py-2 px-4 text-xs text-gray-700 flex items-center justify-between">
          <span>Ready | Jovie Data Processor (JDP) v1.0 | 2025 Jonathan Kleinschmidt – All Rights Reserved</span>
        </footer>
      </div>
    </AppProvider>
  );
}