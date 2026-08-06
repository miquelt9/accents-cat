window.onload = () => {
  const button = document.querySelector('.button');
  const nav = document.querySelector('.nav');
  const accordionItemHeaders = document.querySelectorAll(".accordion-item-header");

  button.addEventListener('click', () => {
    nav.classList.toggle('activo');
  });

  document.querySelectorAll(".a").forEach(n => n.addEventListener("click", () => {
    nav.classList.remove("activo");
  }));

  window.addEventListener("scroll", function () {
    var header = document.querySelector("header");
    header.classList.toggle("desplazamiento", window.scrollY > 0);
  });

  accordionItemHeaders.forEach(accordionItemHeader => {
    accordionItemHeader.addEventListener("click", event => {
      const currentlyActiveAccordionItemHeader = document.querySelector(".accordion-item-header.active");
      if (currentlyActiveAccordionItemHeader && currentlyActiveAccordionItemHeader !== accordionItemHeader) {
        currentlyActiveAccordionItemHeader.classList.toggle("active");
        currentlyActiveAccordionItemHeader.nextElementSibling.style.maxHeight = 0;
      }

      accordionItemHeader.classList.toggle("active");
      const accordionItemBody = accordionItemHeader.nextElementSibling;
      if (accordionItemHeader.classList.contains("active")) {
        accordionItemBody.style.maxHeight = accordionItemBody.scrollHeight + "px";
      } else {
        accordionItemBody.style.maxHeight = 0;
      }
    });
  });
};
