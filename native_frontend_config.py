"""Prepare the scoped BeiAPI native frontend configuration."""


def native_plans_config(text):
    legacy = """    location = /plans {
        root /usr/share/nginx/html/beiapi-plans;
        try_files /plans.html =404;
    }

"""
    assert text.count(legacy) == 1, 'Unexpected legacy plans route'
    old_script = '/beiapi-assets/nav-plans.js'
    assert text.count(old_script) == 2, 'Unexpected navigation script injection'
    return text.replace(legacy, '').replace(old_script, '/beiapi-assets/home-frame-scroll.js')
