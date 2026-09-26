import { useCapabilities } from "./CapabilitiesContext";
export function useModuleCapability(code:string){const{access}=useCapabilities();return access?.modules.find(item=>item.code===code)??null}
