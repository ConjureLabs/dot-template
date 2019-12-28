!{cte}select *
from accounts
where id = !{id}
or email like "!{email}"
limit ${limit}
