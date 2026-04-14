import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  upload: {
    config: {
      sizeLimit: env.int('MAX_UPLOAD_SIZE_MB', 8) * 1024 * 1024,
      providerOptions: {
        localServer: {
          maxage: 300000,
        },
      },
    },
  },
});

export default config;
