import { Link, Navigate, Route, Routes } from "react-router-dom";
import { DetailPage } from "./pages/DetailPage";
import { ListPage } from "./pages/ListPage";

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          InvoiceDesk
        </Link>
        <p className="tagline">Invoices waiting on a person</p>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/invoices/:id" element={<DetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
