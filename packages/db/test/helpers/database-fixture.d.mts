import type { Pool } from "pg"
type Profile = "migrator" | "auth" | "business" | "jobs"
export interface DatabaseTestFixture {
  databaseName: string
  roles: Record<Profile, string>
  urls: Record<Profile | "admin", string>
  pools: Record<Profile | "admin", Pool>
  migrate(): Promise<void>
  provisionJobsSchema(): Promise<void>
  close(): Promise<void>
}
export function validateTestAdminUrl(value: string): URL
export function createDatabaseTestFixture(
  adminUrl: string,
  options?: { migrate?: boolean }
): Promise<DatabaseTestFixture>
