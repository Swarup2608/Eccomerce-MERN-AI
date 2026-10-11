"use client";

import { Toaster } from "react-hot-toast";

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: { borderRadius: "12px", padding: "12px 14px", fontSize: "14px", fontWeight: 500 },
      }}
    />
  );
}
