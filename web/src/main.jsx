import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import AppThemeProvider, { GlobalStyle } from './ui/theme';
import { ToastProvider } from './ui/kit';
import { StructsProvider } from './studio/StructsContext';
import Shell from './studio/Shell';
import Home from './studio/pages/Home';
import Definitions from './studio/pages/Definitions';
import { EditStruct, NewStruct } from './studio/pages/StructPages';
import { EditRecord, NewRecord, Records } from './studio/pages/RecordPages';
import Embed from './studio/pages/Embed';

// Route map (same URLs as before the migration):
//   /                                  Overview (or the struct list on narrow screens)
//   /structs                           Definitions
//   /structs/new                       New struct
//   /structs/:id/edit                  Edit definition          (:id may be an id or a key)
//   /structs/:id/records               Records
//   /structs/:id/form                  New record
//   /structs/:id/record/:recordId      Edit record
//   /embed/:structRef/form|records     Chrome-less page for iframes
createRoot(document.getElementById('root')).render(
  <AppThemeProvider>
    <GlobalStyle />
    <BrowserRouter>
      <Routes>
        <Route path="/embed/:structRef/:view" element={<Embed />} />
        <Route
          element={
            <StructsProvider>
              <ToastProvider>
                <Shell />
              </ToastProvider>
            </StructsProvider>
          }
        >
          <Route index element={<Home />} />
          <Route path="structs" element={<Definitions />} />
          <Route path="structs/new" element={<NewStruct />} />
          <Route path="structs/:id/edit" element={<EditStruct />} />
          <Route path="structs/:id/records" element={<Records />} />
          <Route path="structs/:id/form" element={<NewRecord />} />
          <Route path="structs/:id/record/:recordId" element={<EditRecord />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AppThemeProvider>
);
