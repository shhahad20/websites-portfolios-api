import 'dotenv/config';

export const CV_SYSTEM_PROMPT: string = process.env.CV_SYSTEM_PROMPT ?? (() => {
  throw new Error('Environment variable CV_SYSTEM_PROMPT is not set');
})();