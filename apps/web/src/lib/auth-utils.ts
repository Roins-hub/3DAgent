type SignUpIdentity = {
  id?: string;
};

type SignUpResultLike = {
  user?: {
    identities?: SignUpIdentity[] | null;
  } | null;
};

export function isDuplicateSignUpResult(data: SignUpResultLike | null | undefined) {
  const identities = data?.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}
