// Admin "Departments & roles" page: the school's structure in one place.
//  - Roles: job titles and the powers each one has
//  - Departments: academic departments and offices, with each one's Chair and Dean
import RolesPanel from './RolesPanel'
import DepartmentsPanel from './DepartmentsPanel'

export default function StructurePage() {
  return (
    <div>
      <h1 className="page-title">Departments &amp; roles</h1>
      <p className="muted">Add the departments and job titles your school uses. Then give people a role and department in Manage users.</p>
      <RolesPanel />
      <DepartmentsPanel />
    </div>
  )
}
