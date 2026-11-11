document.querySelector("#study-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target,
    b = Object.fromEntries(new FormData(f));
  const button = f.querySelector("button");
  button.disabled = true;
  try {
    const r = await fetch("/api/usability/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant: b.participant,
          newUser: !!b.newUser,
          consent: !!b.consent,
        }),
      }),
      data = await r.json();
    if (!r.ok) throw Error(data.error);
    location.href = "/?study=" + data.token;
  } catch (err) {
    const el = document.querySelector("#error");
    el.textContent = err.message;
    el.hidden = false;
    button.disabled = false;
  }
};
