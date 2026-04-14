import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  const uploadLimitInBytes = env.int('MAX_UPLOAD_SIZE_MB', 8) * 1024 * 1024;
  const allowedOrigins = env.array('FRONTEND_URL', ['http://localhost:4200', 'http://127.0.0.1:4200']);

  return [
    'strapi::logger',
    'strapi::errors',
    'strapi::security',
    {
      name: 'strapi::cors',
      config: {
        origin: allowedOrigins,
        credentials: true,
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    {
      name: 'strapi::body',
      config: {
        multipart: true,
        formidable: {
          maxFileSize: uploadLimitInBytes,
        },
        formLimit: '2mb',
        jsonLimit: '2mb',
        textLimit: '2mb',
      },
    },
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};

export default config;
