export interface User {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  bio: string;
}

export type PublicProfileUser = Pick<User, 'id' | 'username' | 'first_name' | 'last_name'>;
