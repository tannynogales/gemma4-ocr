/**
 * identity-reading router
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::identity-reading.identity-reading', {
  only: ['find', 'findOne'],
  config: {
    find: {
      auth: false,
    },
    findOne: {
      auth: false,
    },
  },
});
