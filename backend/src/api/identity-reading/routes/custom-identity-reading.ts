export default {
  routes: [
    {
      method: 'GET',
      path: '/identity-readings/models',
      handler: 'identity-reading.models',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/identity-readings/prompt',
      handler: 'identity-reading.prompt',
      config: {
        auth: false,
      },
    },
    {
      method: 'DELETE',
      path: '/identity-readings/purge',
      handler: 'identity-reading.purge',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/identity-readings/extract',
      handler: 'identity-reading.extract',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/identity-readings/:id/confirm',
      handler: 'identity-reading.confirm',
      config: {
        auth: false,
      },
    },
  ],
};
