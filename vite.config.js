import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'src/**/*.test.{js,jsx,ts,tsx}',
      '__tests__/**/*.test.{js,jsx,ts,tsx}',
      'trigger/asaas/**/*.test.ts',
    ],
  },
});
