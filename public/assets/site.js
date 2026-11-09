const io=new IntersectionObserver((es)=>es.forEach((e,i)=>{if(e.isIntersecting){setTimeout(()=>e.target.classList.add("seen"),i*80);io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll(".in").forEach((el)=>io.observe(el));
const bar=document.getElementById("bar"),fields=[...document.querySelectorAll("[data-ink]")];
const ink=()=>{const y=bar.offsetHeight/2;const f=fields.find((el)=>{const r=el.getBoundingClientRect();return r.top<=y&&r.bottom>y});bar.classList.toggle("on-dark",!!f&&f.dataset.ink==="dark");bar.dataset.bg=f?f.dataset.bg||"paper":"paper"};
addEventListener("scroll",ink,{passive:true});ink();
const names=[...document.querySelectorAll(".names span")];let k=0;if(names.length)setInterval(()=>{names.forEach((n)=>n.classList.remove("lit"));names[k++%names.length].classList.add("lit")},2000);
