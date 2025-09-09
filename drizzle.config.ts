import type { Config } from "drizzle-kit";

const config: Config = {
  schema: "./database/schema.ts",   
  out: "./drizzle",                 
  dialect: "sqlite",                
  dbCredentials: {
    url: "time_manager.db",         
  },
};

export default config;