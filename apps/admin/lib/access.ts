/** Temporary testing access. Remove this address to disable private profile reads. */
const SUPER_ADMIN_EMAIL = 'magnus@smitten.fun'

/** Pass only the email from the server-verified Google session, never request input. */
export const isSuperAdmin = (email: string | null | undefined): boolean =>
  typeof email === 'string' && email.toLowerCase() === SUPER_ADMIN_EMAIL
