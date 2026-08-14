create or replace function employee_summary_report(p_from date, p_to date)
returns table (
  employee_id uuid,
  employee_name text,
  salary_paid numeric,
  staff_expense numeric,
  total_paid numeric
)
language sql
stable
as $$
  select
    e.id,
    e.name,
    coalesce(sal.total, 0) as salary_paid,
    coalesce(exp.total, 0) as staff_expense,
    coalesce(sal.total, 0) + coalesce(exp.total, 0) as total_paid
  from employees e
  left join (
    select employee_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'salary'
      and employee_id is not null and date between p_from and p_to
    group by employee_id
  ) sal on sal.employee_id = e.id
  left join (
    select employee_id, sum(amount) as total
    from transactions
    where deleted_at is null and type = 'staff_expense'
      and employee_id is not null and date between p_from and p_to
    group by employee_id
  ) exp on exp.employee_id = e.id
  where e.deleted_at is null;
$$;
