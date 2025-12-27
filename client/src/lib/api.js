import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000",   // backend adresin
  // withCredentials: true  // ❌ BUNU KULLANMIYORUZ
});

// Her istekten önce token'ı header'a ekle
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
