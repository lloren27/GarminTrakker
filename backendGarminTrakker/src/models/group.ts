import { ObjectId } from "mongodb";

export interface Group {
  name: string;
  owner: ObjectId;
  users: ObjectId[];
  usersPending: ObjectId[];
  inviteCode:string
}
