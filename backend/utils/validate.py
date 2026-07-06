import re

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_]+$')
_EMAIL_RE    = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')


def validate_register(username, email, password, age):
    errors = {}

    # username
    u = (username or '').strip()
    if not u:
        errors['username'] = 'Username is required.'
    elif len(u) < 3 or len(u) > 20:
        errors['username'] = 'Username must be 3–20 characters.'
    elif not _USERNAME_RE.match(u):
        errors['username'] = 'Username can only contain letters, numbers, and underscores.'

    # email
    e = (email or '').strip()
    if not e:
        errors['email'] = 'Email is required.'
    elif not _EMAIL_RE.match(e):
        errors['email'] = 'Enter a valid email address.'

    # password
    p = password or ''
    if not p:
        errors['password'] = 'Password is required.'
    elif len(p) < 8:
        errors['password'] = 'Password must be at least 8 characters.'
    elif not re.search(r'[a-zA-Z]', p):
        errors['password'] = 'Password must contain at least one letter.'
    elif not re.search(r'[0-9]', p):
        errors['password'] = 'Password must contain at least one number.'

    # age
    if age is None or age == '':
        errors['age'] = 'Age is required.'
    else:
        try:
            age_int = int(age)
            if age_int < 13:
                errors['age'] = 'You must be at least 13 years old to play.'
            elif age_int > 120:
                errors['age'] = 'Enter a valid age.'
        except (ValueError, TypeError):
            errors['age'] = 'Age must be a whole number.'

    return errors or None


def validate_login(username, password):
    errors = {}
    if not (username or '').strip():
        errors['username'] = 'Username is required.'
    if not (password or ''):
        errors['password'] = 'Password is required.'
    return errors or None
