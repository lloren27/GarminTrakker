import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import GroupsPage from "./pages/GroupsPage";
import TrackerPage from "./pages/TrackerPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/groups" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/track/:trackingId" element={<TrackerPage />} />
      </Routes>
    </BrowserRouter>
  );
}
