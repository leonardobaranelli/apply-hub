import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  DATABASE_URL_REPLICA: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .allow('', null)
    .optional(),
  DATABASE_LOGGING: Joi.boolean().default(false),
});
