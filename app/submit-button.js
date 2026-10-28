'use client';
import {useFormStatus} from 'react-dom';
export default function SubmitButton({children,...props}){const {pending}=useFormStatus();return <button {...props} disabled={pending||props.disabled}>{pending?'Memproses…':children}</button>}
