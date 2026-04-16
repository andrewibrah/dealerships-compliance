export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  adminEmail: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  isProduction: process.env.NODE_ENV === "production",
};
