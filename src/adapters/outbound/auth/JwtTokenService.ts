import jwt from "jsonwebtoken";

type TokenPayload = 
  | {role: "user"; sessionId: string}
  | {role: "admin"; adminId: string}


export class JwtTokenService {
  constructor(private secret: string) {}

  signAdmin(adminId: string) {
    return jwt.sign({ role: "admin", adminId } satisfies TokenPayload, this.secret, { expiresIn: "15m" });
  }

  signUser(guestId: string) {
    return jwt.sign({ role: "user", sessionId: guestId } satisfies TokenPayload, this.secret, { expiresIn: "30m" });
  }

  verify(token: string): TokenPayload {
    const signedtoken = jwt.verify(token, this.secret) as TokenPayload;
    return signedtoken;
  }
}