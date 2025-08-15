import React, { createContext, useContext, useState } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [licenseValid, setLicenseValid] = useState(false);
  const [bucaData, setBucaData] = useState(null);
  const [jovieData, setJovieData] = useState(null);
  const [bucaRows, setBucaRows] = useState([]);
  const [jovieRows, setJovieRows] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [compareResults, setCompareResults] = useState(null);

  const value = {
    licenseValid, setLicenseValid,
    bucaData, setBucaData,
    jovieData, setJovieData,
    bucaRows, setBucaRows,
    jovieRows, setJovieRows,
    corrections, setCorrections,
    compareResults, setCompareResults,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
