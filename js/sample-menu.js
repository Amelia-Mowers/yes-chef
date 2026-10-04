// Sample menu for "Load test menu".

export const SAMPLE_MENU = {
  version: 0,
  categories: [
    {id: 'cat_burgers', name: 'Burgers', color: '#E07A5F', items: [
      {id: 'itm_classic', name: 'Classic Burger', modifierGroups: ['mg_temp', 'mg_extras']},
      {id: 'itm_cheese', name: 'Cheeseburger', modifierGroups: ['mg_temp', 'mg_cheese', 'mg_extras']},
      {id: 'itm_veggie', name: 'Veggie Burger', modifierGroups: ['mg_extras']},
      {id: 'itm_chicken', name: 'Chicken Sandwich', modifierGroups: ['mg_spice', 'mg_extras']}
    ]},
    {id: 'cat_sides', name: 'Sides', color: '#F2CC8F', items: [
      {id: 'itm_fries', name: 'Fries', modifierGroups: ['mg_size']},
      {id: 'itm_rings', name: 'Onion Rings', modifierGroups: ['mg_size']},
      {id: 'itm_salad', name: 'Side Salad', modifierGroups: ['mg_dressing']}
    ]},
    {id: 'cat_drinks', name: 'Drinks', color: '#81B29A', items: [
      {id: 'itm_cola', name: 'Cola', modifierGroups: ['mg_size', 'mg_ice']},
      {id: 'itm_lemonade', name: 'Lemonade', modifierGroups: ['mg_size', 'mg_ice']},
      {id: 'itm_shake', name: 'Milkshake', modifierGroups: ['mg_flavor']},
      {id: 'itm_water', name: 'Water', modifierGroups: []}
    ]},
    {id: 'cat_desserts', name: 'Desserts', color: '#9C89B8', items: [
      {id: 'itm_brownie', name: 'Brownie', modifierGroups: ['mg_icecream']},
      {id: 'itm_pie', name: 'Apple Pie', modifierGroups: ['mg_icecream']}
    ]}
  ],
  modifierGroups: [
    {id: 'mg_temp', name: 'Temperature', select: 'single', required: true, options: [
      {id: 'opt_mr', name: 'Medium rare'}, {id: 'opt_m', name: 'Medium'}, {id: 'opt_wd', name: 'Well done'}
    ]},
    {id: 'mg_cheese', name: 'Cheese', select: 'single', required: true, options: [
      {id: 'opt_cheddar', name: 'Cheddar'}, {id: 'opt_swiss', name: 'Swiss'}, {id: 'opt_blue', name: 'Blue cheese'}
    ]},
    {id: 'mg_extras', name: 'Extras', select: 'multi', required: false, options: [
      {id: 'opt_bacon', name: 'Add bacon'}, {id: 'opt_egg', name: 'Add egg'}, {id: 'opt_noonion', name: 'No onion'}, {id: 'opt_notomato', name: 'No tomato'}
    ]},
    {id: 'mg_spice', name: 'Spice', select: 'single', required: false, options: [
      {id: 'opt_mild', name: 'Mild'}, {id: 'opt_hot', name: 'Hot'}
    ]},
    {id: 'mg_size', name: 'Size', select: 'single', required: true, options: [
      {id: 'opt_small', name: 'Small'}, {id: 'opt_regular', name: 'Regular'}, {id: 'opt_large', name: 'Large'}
    ]},
    {id: 'mg_ice', name: 'Ice', select: 'single', required: false, options: [
      {id: 'opt_noice', name: 'No ice'}, {id: 'opt_lightice', name: 'Light ice'}
    ]},
    {id: 'mg_dressing', name: 'Dressing', select: 'single', required: true, options: [
      {id: 'opt_ranch', name: 'Ranch'}, {id: 'opt_vinaigrette', name: 'Vinaigrette'}
    ]},
    {id: 'mg_flavor', name: 'Flavor', select: 'single', required: true, options: [
      {id: 'opt_vanilla', name: 'Vanilla'}, {id: 'opt_choc', name: 'Chocolate'}, {id: 'opt_straw', name: 'Strawberry'}
    ]},
    {id: 'mg_icecream', name: 'Ice cream', select: 'single', required: false, options: [
      {id: 'opt_scoop', name: 'Add a scoop'}
    ]}
  ]
}
