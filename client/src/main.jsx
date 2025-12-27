// client/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Notes from "./pages/Notes.jsx";
import "./index.css";

// Eğer App'i ayrı bir sayfa olarak kullanmak istersen:
// import App from "./pages/App.jsx";

const router = createBrowserRouter([
  // UYGULAMA AÇILDIĞINDA AÇILAN SAYFA = LOGIN
  { path: "/", element: <Login /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/notes", element: <Notes /> },

  // İstersen App'i ayrı route olarak tut:
  // { path: "/home", element: <App /> },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
