const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export function compareRoleThenPerson<T>(role:(item:T)=>string,person:(item:T)=>string){
  return (left:T,right:T)=>collator.compare(role(left),role(right))||collator.compare(person(left),person(right));
}
