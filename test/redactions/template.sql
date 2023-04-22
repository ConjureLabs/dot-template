select *
from super_sensitive_pii_stuff
where 1
  and really_identifiable_info = '!{pii}'
  and totally_okay = ${randomNumber};
