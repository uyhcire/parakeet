import { FirebaseApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const getCustomAuthToken = async (app: FirebaseApp): Promise<string> => {
  const functions = getFunctions(app);
  const getCustomAuthTokenCloudFunction = httpsCallable(
    functions,
    "parakeet/getCustomAuthToken"
  );
  const result = await getCustomAuthTokenCloudFunction();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const customAuthToken = data.customAuthToken!;
  return customAuthToken;
};

export default getCustomAuthToken;
