import { handlers } from "@/auth";

// NextAuth v5 mounts both GET and POST on the catch-all route
export const { GET, POST } = handlers;
